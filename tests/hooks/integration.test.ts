/**
 * Full lifecycle integration test for ACM hooks
 * Issue #41: test(hooks): full lifecycle integration test
 *
 * Tests: interrupt → user-prompt → tool-success → stop → session-end → session-start
 * Verifies: Signal recording → Experience generation → Retrieval → Injection
 */

import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handlePostToolUseFailure } from "../../src/hooks/post-tool-use-failure.js";
import { handleUserPromptSubmit } from "../../src/hooks/user-prompt-submit.js";
import { handlePostToolUse } from "../../src/hooks/post-tool-use.js";
import { handleStop } from "../../src/hooks/stop.js";
import { handleSessionEnd } from "../../src/hooks/session-end.js";
import { retrieveAndInject } from "../../src/hooks/session-start.js";
import { bootstrapHook } from "../../src/hooks/_common.js";

const TMP_DIR = join(tmpdir(), "acm-test-integration");
const EMBEDDING_DIM = 384;

function setupEnv(): string {
  mkdirSync(TMP_DIR, { recursive: true });
  const dbPath = join(TMP_DIR, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const configPath = join(
    TMP_DIR,
    `config-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  writeFileSync(
    configPath,
    JSON.stringify({
      mode: "full",
      db_path: dbPath,
      promotion_threshold: 0.1,
      top_k: 5,
      capture_turns: 5,
    })
  );
  process.env.ACM_CONFIG_PATH = configPath;
  return dbPath;
}

function makeFakeEmbedding(seed: number): Float32Array {
  const arr = new Float32Array(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    arr[i] = Math.sin(seed * (i + 1));
  }
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) norm += arr[i] * arr[i];
  norm = Math.sqrt(norm);
  for (let i = 0; i < EMBEDDING_DIM; i++) arr[i] /= norm;
  return arr;
}

describe("ACM hooks full lifecycle", () => {
  const originalEnv = process.env.ACM_CONFIG_PATH;

  afterEach(() => {
    process.env.ACM_CONFIG_PATH = originalEnv;
    try {
      rmSync(TMP_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("completes full cycle: signals → experience → retrieval → injection", () => {
    setupEnv();
    const session1 = "lifecycle-s1";

    // === Session 1: Failure scenario ===

    // Step 1: Tool fails with interrupt
    handlePostToolUseFailure(
      JSON.stringify({
        session_id: session1,
        tool_name: "Bash",
        error: "npm install failed: EACCES permission denied",
        is_interrupt: true,
      })
    );

    // Step 2: User provides corrective feedback
    handleUserPromptSubmit(
      JSON.stringify({
        session_id: session1,
        prompt: "No, you need to use sudo for global installs",
      })
    );

    // Step 3: Another user prompt (within capture window)
    handleUserPromptSubmit(
      JSON.stringify({
        session_id: session1,
        prompt: "Try sudo npm install -g instead",
      })
    );

    // Step 4: Tool succeeds after correction
    handlePostToolUse(
      JSON.stringify({
        session_id: session1,
        tool_name: "Bash",
        tool_input: { command: "sudo npm install -g typescript" },
        result: "added 1 package",
      })
    );

    // Step 5: Session stops
    handleStop(JSON.stringify({ session_id: session1 }));

    // Verify signals were recorded
    let ctx = bootstrapHook(JSON.stringify({ session_id: session1 }));
    expect(ctx).not.toBeNull();
    const signals = ctx!.signalStore.getBySession(session1);
    expect(signals.length).toBeGreaterThanOrEqual(4);

    const interruptSignals = signals.filter((s) => s.event_type === "interrupt");
    expect(interruptSignals).toHaveLength(1);

    const postInterruptSignals = signals.filter((s) => s.event_type === "post_interrupt_turn");
    expect(postInterruptSignals.length).toBeGreaterThanOrEqual(1);

    const toolSuccessSignals = signals.filter((s) => s.event_type === "tool_success");
    expect(toolSuccessSignals).toHaveLength(1);

    const stopSignals = signals.filter((s) => s.event_type === "stop");
    expect(stopSignals).toHaveLength(1);
    ctx!.cleanup();

    // Step 6: Session ends — generate experience
    handleSessionEnd(JSON.stringify({ session_id: session1 }));

    // Verify experience was created
    ctx = bootstrapHook(JSON.stringify({ session_id: session1 }));
    const entries = ctx!.experienceStore.list();
    expect(entries.length).toBeGreaterThanOrEqual(1);

    const failureEntry = entries.find((e) => e.type === "failure");
    expect(failureEntry).toBeDefined();
    expect(failureEntry!.signal_type).toBe("interrupt_with_dialogue");
    expect(failureEntry!.signal_strength).toBeGreaterThanOrEqual(0.9);
    expect(failureEntry!.trigger).toContain("npm install failed");

    // Manually add embedding (in real flow, session-end would do this async)
    const embedding = makeFakeEmbedding(42);
    ctx!.experienceStore.updateEmbedding(failureEntry!.id, embedding);

    // Step 7: New session starts — retrieve and inject
    const queryEmbedding = makeFakeEmbedding(42); // Same seed = high similarity
    const injection = retrieveAndInject(ctx!, queryEmbedding, "retrieve-session", "query");
    ctx!.cleanup();

    expect(injection).toContain("[ACM Context]");
    expect(injection).toContain("FAILURE");
    expect(injection).toContain("npm install failed");
  });

  it("handles success-only session lifecycle", () => {
    setupEnv();
    const session2 = "lifecycle-s2";

    // Clean session: only tool successes
    handlePostToolUse(
      JSON.stringify({
        session_id: session2,
        tool_name: "Bash",
        tool_input: { command: "npx vitest run" },
        result: "Tests passed",
        exit_code: 0,
      })
    );
    handlePostToolUse(
      JSON.stringify({
        session_id: session2,
        tool_name: "Read",
        tool_input: { file_path: "/src/index.ts" },
        result: "file contents",
      })
    );
    handleStop(JSON.stringify({ session_id: session2 }));

    // Generate experience
    handleSessionEnd(JSON.stringify({ session_id: session2 }));

    // Verify success entry
    const ctx = bootstrapHook(JSON.stringify({ session_id: session2 }));
    const entries = ctx!.experienceStore.list();
    const successEntry = entries.find((e) => e.type === "success" && e.session_id === session2);
    expect(successEntry).toBeDefined();
    expect(successEntry!.signal_type).toBe("uninterrupted_completion");
    ctx!.cleanup();
  });

  it("handles multiple sessions accumulating experiences", () => {
    setupEnv();

    // Session A: failure
    const sA = "multi-sA";
    handlePostToolUseFailure(
      JSON.stringify({
        session_id: sA,
        tool_name: "Bash",
        error: "error A",
        is_interrupt: true,
      })
    );
    handleStop(JSON.stringify({ session_id: sA }));
    handleSessionEnd(JSON.stringify({ session_id: sA }));

    // Session B: success
    const sB = "multi-sB";
    handlePostToolUse(
      JSON.stringify({
        session_id: sB,
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        result: "ok",
        exit_code: 0,
      })
    );
    handleStop(JSON.stringify({ session_id: sB }));
    handleSessionEnd(JSON.stringify({ session_id: sB }));

    // Verify both experiences exist
    const ctx = bootstrapHook(JSON.stringify({ session_id: "verify" }));
    const entries = ctx!.experienceStore.list();
    expect(entries.length).toBeGreaterThanOrEqual(2);

    const types = new Set(entries.map((e) => e.type));
    expect(types.has("failure")).toBe(true);
    expect(types.has("success")).toBe(true);
    ctx!.cleanup();
  });

  it("isolates signals between sessions", () => {
    setupEnv();

    const sX = "iso-sX";
    const sY = "iso-sY";

    handlePostToolUseFailure(
      JSON.stringify({
        session_id: sX,
        tool_name: "Bash",
        error: "err X",
        is_interrupt: true,
      })
    );

    handlePostToolUse(
      JSON.stringify({
        session_id: sY,
        tool_name: "Read",
        tool_input: { file_path: "test.ts" },
        result: "contents",
      })
    );

    // Verify isolation
    const ctx = bootstrapHook(JSON.stringify({ session_id: "check" }));
    const signalsX = ctx!.signalStore.getBySession(sX);
    const signalsY = ctx!.signalStore.getBySession(sY);

    expect(signalsX).toHaveLength(1);
    expect(signalsX[0].event_type).toBe("interrupt");

    expect(signalsY).toHaveLength(1);
    expect(signalsY[0].event_type).toBe("tool_success");
    ctx!.cleanup();
  });
});
