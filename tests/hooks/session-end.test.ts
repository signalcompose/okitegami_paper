/**
 * Tests for session-end hook — experience generation
 * Issue #39: feat(hooks): session-end hook
 */

import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleSessionEnd } from "../../src/hooks/session-end.js";
import { handlePostToolUseFailure } from "../../src/hooks/post-tool-use-failure.js";
import { handleUserPromptSubmit } from "../../src/hooks/user-prompt-submit.js";
import { handlePostToolUse } from "../../src/hooks/post-tool-use.js";
import { handleStop } from "../../src/hooks/stop.js";
import { bootstrapHook } from "../../src/hooks/_common.js";

const TMP_DIR = join(tmpdir(), "acm-test-session-end");

function setupEnv(mode: string = "full"): string {
  mkdirSync(TMP_DIR, { recursive: true });
  const dbPath = join(TMP_DIR, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const configPath = join(
    TMP_DIR,
    `config-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  writeFileSync(
    configPath,
    JSON.stringify({
      mode,
      db_path: dbPath,
      promotion_threshold: 0.1,
    })
  );
  process.env.ACM_CONFIG_PATH = configPath;
  return dbPath;
}

describe("session-end hook", () => {
  const originalEnv = process.env.ACM_CONFIG_PATH;

  afterEach(() => {
    process.env.ACM_CONFIG_PATH = originalEnv;
    try {
      rmSync(TMP_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("generates failure experience from interrupt + corrective signals", async () => {
    setupEnv();
    const sessionId = "end-s1";

    // Create interrupt + post-interrupt signals
    await handlePostToolUseFailure(
      JSON.stringify({
        session_id: sessionId,
        tool_name: "Bash",
        error: "command failed",
        is_interrupt: true,
      })
    );
    await handleUserPromptSubmit(
      JSON.stringify({
        session_id: sessionId,
        prompt: "No, use the correct approach",
      })
    );

    // Corrective instruction reported by Claude via acm_record_signal
    const ctx1 = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    ctx1!.signalStore.addSignal(sessionId, "corrective_instruction", {
      prompt: "No, use the correct approach",
      reason: "wrong approach",
    });
    ctx1!.cleanup();

    await handleStop(JSON.stringify({ session_id: sessionId }));

    // Run session-end
    await handleSessionEnd(JSON.stringify({ session_id: sessionId }));

    // Verify experience was created
    const ctx = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const entries = ctx!.experienceStore.list();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const failure = entries.find((e) => e.type === "failure");
    expect(failure).toBeDefined();
    expect(failure!.signal_type).toBe("interrupt_with_dialogue");
    expect(failure!.signal_strength).toBeGreaterThan(0);
    ctx!.cleanup();
  });

  it("generates success experience from clean session", async () => {
    setupEnv();
    const sessionId = "end-s2";

    // Tool success + stop
    await handlePostToolUse(
      JSON.stringify({
        session_id: sessionId,
        tool_name: "Bash",
        tool_input: { command: "npx vitest run" },
        result: "Tests passed",
        exit_code: 0,
      })
    );
    await handleStop(JSON.stringify({ session_id: sessionId }));

    await handleSessionEnd(JSON.stringify({ session_id: sessionId }));

    const ctx = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const entries = ctx!.experienceStore.list();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const success = entries.find((e) => e.type === "success");
    expect(success).toBeDefined();
    expect(success!.signal_type).toBe("uninterrupted_completion");
    ctx!.cleanup();
  });

  it("does nothing when no signals exist", async () => {
    setupEnv();
    const sessionId = "end-s3";

    await handleSessionEnd(JSON.stringify({ session_id: sessionId }));

    const ctx = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const entries = ctx!.experienceStore.list();
    expect(entries).toHaveLength(0);
    ctx!.cleanup();
  });

  it("does nothing when mode is disabled", async () => {
    setupEnv("disabled");
    await handleSessionEnd(JSON.stringify({ session_id: "end-s4" }));
    // Should not throw
  });

  it("records project name from cwd in experience entries", async () => {
    setupEnv();
    const sessionId = "end-proj";

    // Tool success + stop with cwd
    await handlePostToolUse(
      JSON.stringify({
        session_id: sessionId,
        tool_name: "Bash",
        tool_input: { command: "echo ok" },
        result: "ok",
        cwd: "/home/user/my-project",
      })
    );
    await handleStop(JSON.stringify({ session_id: sessionId, cwd: "/home/user/my-project" }));

    // Session-end with cwd
    await handleSessionEnd(JSON.stringify({ session_id: sessionId, cwd: "/home/user/my-project" }));

    const ctx = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const entries = ctx!.experienceStore.list();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const entry = entries[0];
    expect(entry.project).toBe("my-project");
    ctx!.cleanup();
  });

  it("generates experience entries with embeddings", async () => {
    setupEnv();
    const sessionId = "end-embed";

    // Tool success + stop
    await handlePostToolUse(
      JSON.stringify({
        session_id: sessionId,
        tool_name: "Bash",
        tool_input: { command: "npx vitest run" },
        result: "Tests passed",
        exit_code: 0,
      })
    );
    await handleStop(JSON.stringify({ session_id: sessionId }));

    await handleSessionEnd(JSON.stringify({ session_id: sessionId }));

    // Verify experience has embedding
    const ctx = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const entriesWithEmbedding = ctx!.experienceStore.getAllWithEmbedding();
    expect(entriesWithEmbedding.length).toBeGreaterThanOrEqual(1);
    expect(entriesWithEmbedding[0].embedding).toBeInstanceOf(Float32Array);
    expect(entriesWithEmbedding[0].embedding.length).toBe(384);
    ctx!.cleanup();
  });

  it("respects success_only mode filtering", async () => {
    setupEnv("success_only");
    const sessionId = "end-s5";

    // Create interrupt + corrective signals → generates failure entry
    await handlePostToolUseFailure(
      JSON.stringify({
        session_id: sessionId,
        tool_name: "Bash",
        error: "err",
        is_interrupt: true,
      })
    );
    // Add corrective signal directly (simulating Claude's acm_record_signal)
    const ctx1 = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    ctx1!.signalStore.addSignal(sessionId, "corrective_instruction", {
      prompt: "Wrong approach",
      reason: "incorrect",
    });
    ctx1!.cleanup();

    await handleStop(JSON.stringify({ session_id: sessionId }));

    await handleSessionEnd(JSON.stringify({ session_id: sessionId }));

    // In success_only mode, failure entries should be filtered out by listByMode
    const ctx = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const entries = ctx!.experienceStore.listByMode();
    const failures = entries.filter((e) => e.type === "failure");
    expect(failures).toHaveLength(0);
    ctx!.cleanup();
  });

  it("feedback loop: adjusts feedback_score +1 when no corrective after injection", async () => {
    setupEnv();
    const sessionId = "end-fb-pos";

    // Create an injection signal with injected_ids
    const ctx1 = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const entry = ctx1!.experienceStore.create({
      type: "success",
      trigger: "test trigger",
      action: "test action",
      outcome: "test outcome",
      retrieval_keys: ["test"],
      signal_strength: 0.75,
      signal_type: "uninterrupted_completion",
      session_id: "prev-session",
      timestamp: new Date().toISOString(),
    });
    expect(entry).not.toBeNull();

    // Record injection signal with the entry's id
    ctx1!.signalStore.addSignal(sessionId, "injection", {
      injected_ids: [entry!.id],
      count: 1,
    });
    // Record a stop signal (clean session, no corrective)
    ctx1!.signalStore.addSignal(sessionId, "stop", {});
    ctx1!.cleanup();

    await handleSessionEnd(JSON.stringify({ session_id: sessionId }));

    const ctx2 = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const updated = ctx2!.experienceStore.getById(entry!.id);
    expect(updated?.feedback_score).toBe(1);
    ctx2!.cleanup();
  });

  it("feedback loop: adjusts feedback_score -1 when corrective after injection", async () => {
    setupEnv();
    const sessionId = "end-fb-neg";

    // Create an entry and injection signal
    const ctx1 = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const entry = ctx1!.experienceStore.create({
      type: "success",
      trigger: "test trigger",
      action: "test action",
      outcome: "test outcome",
      retrieval_keys: ["test"],
      signal_strength: 0.75,
      signal_type: "uninterrupted_completion",
      session_id: "prev-session",
      timestamp: new Date().toISOString(),
    });
    expect(entry).not.toBeNull();

    ctx1!.signalStore.addSignal(sessionId, "injection", {
      injected_ids: [entry!.id],
      count: 1,
    });
    // Add corrective signal
    ctx1!.signalStore.addSignal(sessionId, "corrective_instruction", {
      prompt: "Wrong approach",
      reason: "incorrect",
    });
    ctx1!.signalStore.addSignal(sessionId, "stop", {});
    ctx1!.cleanup();

    await handleSessionEnd(JSON.stringify({ session_id: sessionId }));

    const ctx2 = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const updated = ctx2!.experienceStore.getById(entry!.id);
    expect(updated?.feedback_score).toBe(-1);
    ctx2!.cleanup();
  });

  it("session segment: second SessionEnd evaluates only new signals", async () => {
    setupEnv();
    const sessionId = "seg-s1";

    // --- Segment 1: corrective → failure ---
    const ctx1 = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    ctx1!.signalStore.addSignal(sessionId, "tool_success", { tool_name: "Bash" });
    ctx1!.signalStore.addSignal(sessionId, "corrective_instruction", {
      prompt: "Wrong approach",
      reason: "test",
    });
    ctx1!.signalStore.addSignal(sessionId, "stop", {});
    ctx1!.cleanup();

    await handleSessionEnd(JSON.stringify({ session_id: sessionId }));

    // Verify segment 1 produced failure
    const ctx2 = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const entries1 = ctx2!.experienceStore.list();
    expect(entries1.filter((e) => e.type === "failure")).toHaveLength(1);
    expect(entries1.filter((e) => e.type === "success")).toHaveLength(0);

    // Verify evaluation was recorded
    const lastEval = ctx2!.experienceStore.getLastEvaluatedAt(sessionId);
    expect(lastEval).toBeTruthy();
    ctx2!.cleanup();

    // Small delay to ensure timestamp separation
    await new Promise((r) => setTimeout(r, 15));

    // --- Segment 2: clean signals → success ---
    const ctx3 = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    ctx3!.signalStore.addSignal(sessionId, "tool_success", { tool_name: "Read" });
    ctx3!.signalStore.addSignal(sessionId, "tool_success", { tool_name: "Bash" });
    ctx3!.signalStore.addSignal(sessionId, "stop", {});
    ctx3!.cleanup();

    // Second SessionEnd for same session_id
    await handleSessionEnd(JSON.stringify({ session_id: sessionId }));

    // Verify segment 2 produced success
    const ctx4 = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const entries2 = ctx4!.experienceStore.list();
    expect(entries2.filter((e) => e.type === "failure")).toHaveLength(1);
    expect(entries2.filter((e) => e.type === "success")).toHaveLength(1);
    ctx4!.cleanup();
  });

  it("session segment: ambiguous segment records evaluation marker", async () => {
    setupEnv();
    const sessionId = "seg-ambig";

    // --- Segment 1: interrupted with no corrective → ambiguous ---
    const ctx1 = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    ctx1!.signalStore.addSignal(sessionId, "interrupt", { tool_name: "Bash", error: "SIGINT" });
    ctx1!.cleanup();

    await handleSessionEnd(JSON.stringify({ session_id: sessionId }));

    // No entries generated, but evaluation should be recorded
    const ctx2 = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    expect(ctx2!.experienceStore.list()).toHaveLength(0);
    expect(ctx2!.experienceStore.getLastEvaluatedAt(sessionId)).toBeTruthy();
    ctx2!.cleanup();
  });
});
