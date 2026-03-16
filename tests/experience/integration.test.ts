/**
 * Integration test: signal recording → experience generation → DB persistence
 * Validates Phase 1 + Phase 2 + Phase 3 working together.
 *
 * Revised: Corrective instructions are reported via acm_record_signal
 * (not auto-detected by regex). Interrupt alone is ambiguous.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { initializeDatabase } from "../../src/store/schema.js";
import { ExperienceStore } from "../../src/store/experience-store.js";
import { SessionSignalStore } from "../../src/signals/session-store.js";
import { SignalCollector } from "../../src/signals/signal-collector.js";
import { ExperienceGenerator } from "../../src/experience/generator.js";
import { createAcmServer } from "../../src/server/tools.js";
import type { AcmConfig } from "../../src/store/types.js";
import type { AdaptedDatabase } from "../../src/store/sqlite-adapter.js";

const TEST_CONFIG: AcmConfig = {
  mode: "full",
  top_k: 5,
  capture_turns: 5,
  promotion_threshold: 0.3,
  db_path: ":memory:",
};

describe("Signal → Experience Integration", () => {
  let db: AdaptedDatabase;
  let experienceStore: ExperienceStore;
  let signalStore: SessionSignalStore;
  let collector: SignalCollector;
  let generator: ExperienceGenerator;

  beforeEach(async () => {
    db = await initializeDatabase(":memory:");
    const expDb = await initializeDatabase(":memory:");
    experienceStore = new ExperienceStore(expDb, TEST_CONFIG);
    signalStore = new SessionSignalStore(db);
    collector = new SignalCollector(signalStore, {
      capture_turns: TEST_CONFIG.capture_turns,
    });
    generator = new ExperienceGenerator({
      capture_turns: TEST_CONFIG.capture_turns,
      promotion_threshold: TEST_CONFIG.promotion_threshold,
    });
  });

  afterEach(() => {
    experienceStore.close();
    db.close();
  });

  it("generates failure entry from interrupt + corrective flow", () => {
    const sessionId = "int-session-1";

    // Simulate hook events: interrupt + corrective via acm_record_signal
    collector.handleInterrupt(sessionId, "Bash", "npm test failed");
    collector.handleUserPrompt(sessionId, "That's wrong, don't run tests on the build directory");
    collector.handleUserPrompt(sessionId, "Use the source directory instead");
    // Claude Code reports corrective instructions via acm_record_signal
    signalStore.addSignal(sessionId, "corrective_instruction", {
      prompt: "That's wrong, don't run tests on the build directory",
      reason: "wrong directory",
    });
    signalStore.addSignal(sessionId, "corrective_instruction", {
      prompt: "Use the source directory instead",
      reason: "source not build",
    });

    const summary = collector.getSessionSummary(sessionId);
    const signals = signalStore.getBySession(sessionId);
    const entries = generator.generate({ session_id: sessionId, summary, signals });

    expect(entries.length).toBeGreaterThanOrEqual(1);

    const failure = entries.find((e) => e.type === "failure");
    expect(failure).toBeDefined();
    expect(failure!.signal_type).toBe("interrupt_with_dialogue");
    // Interrupt + 2 corrective → strength in 0.40–0.60 range
    expect(failure!.signal_strength).toBeGreaterThanOrEqual(0.4);
    expect(failure!.interrupt_context).toBeDefined();
    expect(failure!.retrieval_keys).toContain("Bash");

    // Persist to DB
    const saved = experienceStore.create(failure!);
    expect(saved).not.toBeNull();
    expect(saved!.id).toBeDefined();

    // Verify retrieval
    const retrieved = experienceStore.getById(saved!.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.signal_type).toBe("interrupt_with_dialogue");
    expect(retrieved!.signal_strength).toBe(failure!.signal_strength);
  });

  it("generates no entry for interrupt without corrective (ambiguous)", () => {
    const sessionId = "int-only-session";

    collector.handleInterrupt(sessionId, "Bash", "npm test failed");
    collector.handleUserPrompt(sessionId, "Let me think about this");

    const summary = collector.getSessionSummary(sessionId);
    const signals = signalStore.getBySession(sessionId);
    const entries = generator.generate({ session_id: sessionId, summary, signals });

    expect(entries).toEqual([]);
  });

  it("generates success entry from clean completion with tests", () => {
    const sessionId = "clean-session-1";

    collector.handleToolSuccess(sessionId, "Read", { file_path: "src/main.ts" });
    collector.handleToolSuccess(sessionId, "Edit", { file_path: "src/main.ts" });
    collector.handleToolSuccess(sessionId, "Bash", { command: "npx vitest run" }, 0);
    collector.handleStop(sessionId);

    const summary = collector.getSessionSummary(sessionId);
    const signals = signalStore.getBySession(sessionId);
    const entries = generator.generate({ session_id: sessionId, summary, signals });

    expect(entries.length).toBe(1);
    const success = entries[0];
    expect(success.type).toBe("success");
    expect(success.signal_type).toBe("uninterrupted_completion");
    expect(success.signal_strength).toBeGreaterThanOrEqual(0.7);
    expect(success.retrieval_keys).toContain("Read");
    expect(success.retrieval_keys).toContain("Edit");
    expect(success.retrieval_keys).toContain("Bash");

    const saved = experienceStore.create(success);
    expect(saved).not.toBeNull();

    const all = experienceStore.list();
    expect(all.length).toBe(1);
    expect(all[0].type).toBe("success");
  });

  it("generates failure from corrective instructions (3+) reported by Claude", () => {
    const sessionId = "corrective-session-1";

    // Claude reports corrective instructions via acm_record_signal
    signalStore.addSignal(sessionId, "corrective_instruction", {
      prompt: "No, that's wrong",
      reason: "incorrect approach",
    });
    signalStore.addSignal(sessionId, "corrective_instruction", {
      prompt: "Try again with a different approach",
      reason: "wrong method",
    });
    signalStore.addSignal(sessionId, "corrective_instruction", {
      prompt: "That's not what I meant",
      reason: "misunderstanding",
    });
    collector.handleToolSuccess(sessionId, "Edit", { file_path: "src/app.ts" });
    signalStore.addSignal(sessionId, "corrective_instruction", {
      prompt: "Undo that change",
      reason: "unwanted edit",
    });
    collector.handleStop(sessionId);

    const summary = collector.getSessionSummary(sessionId);
    const signals = signalStore.getBySession(sessionId);
    const entries = generator.generate({ session_id: sessionId, summary, signals });

    const failures = entries.filter((e) => e.type === "failure");
    const successes = entries.filter((e) => e.type === "success");
    expect(failures.length).toBe(1);
    expect(successes.length).toBe(0);
    expect(failures[0].signal_type).toBe("corrective_instruction");
    expect(failures[0].signal_strength).toBeGreaterThanOrEqual(0.6);
  });

  it("handles empty session gracefully", () => {
    const sessionId = "empty-session";
    const summary = collector.getSessionSummary(sessionId);
    const signals = signalStore.getBySession(sessionId);
    const entries = generator.generate({ session_id: sessionId, summary, signals });
    expect(entries).toEqual([]);
  });

  it("full pipeline: multiple sessions, multiple experience types", () => {
    // Session 1: interrupt + corrective → failure
    collector.handleInterrupt("s1", "Bash", "build failed");
    collector.handleUserPrompt("s1", "Fix the build error in webpack config");
    signalStore.addSignal("s1", "corrective_instruction", {
      prompt: "Fix the build error in webpack config",
      reason: "build failure",
    });

    // Session 2: clean success
    collector.handleToolSuccess("s2", "Read", { file_path: "README.md" });
    collector.handleToolSuccess("s2", "Bash", { command: "npm test" }, 0);
    collector.handleStop("s2");

    for (const sid of ["s1", "s2"]) {
      const summary = collector.getSessionSummary(sid);
      const signals = signalStore.getBySession(sid);
      const entries = generator.generate({ session_id: sid, summary, signals });
      for (const entry of entries) {
        experienceStore.create(entry);
      }
    }

    const all = experienceStore.list();
    expect(all.length).toBe(2);

    const types = new Set(all.map((e) => e.type));
    expect(types.has("failure")).toBe(true);
    expect(types.has("success")).toBe(true);

    const successes = experienceStore.listByMode();
    expect(successes.length).toBe(2); // mode=full returns all
  });
});

describe("acm_generate_experience MCP tool", () => {
  let db: AdaptedDatabase;
  let experienceStore: ExperienceStore;
  let client: Client;

  beforeEach(async () => {
    db = await initializeDatabase(":memory:");
    const expDb = await initializeDatabase(":memory:");
    experienceStore = new ExperienceStore(expDb, TEST_CONFIG);

    const server = createAcmServer({
      db,
      capture_turns: TEST_CONFIG.capture_turns,
      promotion_threshold: TEST_CONFIG.promotion_threshold,
      experienceStore,
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "test-client", version: "0.0.1" });
    await client.connect(clientTransport);
  });

  afterEach(() => {
    experienceStore.close();
    db.close();
  });

  it("generates and persists experience entries via MCP tool", async () => {
    const sessionId = "mcp-test-session";

    // Record signals via MCP — need corrective instruction for failure generation
    await client.callTool({
      name: "acm_record_signal",
      arguments: {
        session_id: sessionId,
        event_type: "corrective_instruction",
        data: JSON.stringify({ prompt: "That's wrong, fix it", reason: "incorrect approach" }),
      },
    });
    await client.callTool({
      name: "acm_record_signal",
      arguments: {
        session_id: sessionId,
        event_type: "corrective_instruction",
        data: JSON.stringify({ prompt: "Try again", reason: "wrong method" }),
      },
    });
    await client.callTool({
      name: "acm_record_signal",
      arguments: {
        session_id: sessionId,
        event_type: "corrective_instruction",
        data: JSON.stringify({ prompt: "Not what I wanted", reason: "misunderstanding" }),
      },
    });

    // Generate experience via MCP tool
    const result = await client.callTool({
      name: "acm_generate_experience",
      arguments: { session_id: sessionId },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);

    expect(parsed.session_id).toBe(sessionId);
    expect(parsed.generated).toBeGreaterThanOrEqual(1);
    expect(parsed.persisted).toBe(parsed.generated);
    expect(parsed.ids.length).toBe(parsed.persisted);

    const all = experienceStore.list();
    expect(all.length).toBe(parsed.persisted);
    expect(all[0].session_id).toBe(sessionId);
  });

  it("returns empty result for session with no signals", async () => {
    const result = await client.callTool({
      name: "acm_generate_experience",
      arguments: { session_id: "nonexistent-session" },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);

    expect(parsed.generated).toBe(0);
    expect(parsed.persisted).toBe(0);
    expect(parsed.ids).toEqual([]);
  });
});
