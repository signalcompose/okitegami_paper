/**
 * Tests for session-end hook — experience generation and embedding
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

  it("generates failure experience from interrupt signals", () => {
    setupEnv();
    const sessionId = "end-s1";

    // Create interrupt + post-interrupt signals
    handlePostToolUseFailure(
      JSON.stringify({
        session_id: sessionId,
        tool_name: "Bash",
        error: "command failed",
        is_interrupt: true,
      })
    );
    handleUserPromptSubmit(
      JSON.stringify({
        session_id: sessionId,
        prompt: "No, use the correct approach",
      })
    );
    handleStop(JSON.stringify({ session_id: sessionId }));

    // Run session-end
    handleSessionEnd(JSON.stringify({ session_id: sessionId }));

    // Verify experience was created
    const ctx = bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const entries = ctx!.experienceStore.list();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const failure = entries.find((e) => e.type === "failure");
    expect(failure).toBeDefined();
    expect(failure!.signal_type).toBe("interrupt_with_dialogue");
    expect(failure!.signal_strength).toBeGreaterThan(0);
    ctx!.cleanup();
  });

  it("generates success experience from clean session", () => {
    setupEnv();
    const sessionId = "end-s2";

    // Tool success + stop
    handlePostToolUse(
      JSON.stringify({
        session_id: sessionId,
        tool_name: "Bash",
        tool_input: { command: "npx vitest run" },
        result: "Tests passed",
        exit_code: 0,
      })
    );
    handleStop(JSON.stringify({ session_id: sessionId }));

    handleSessionEnd(JSON.stringify({ session_id: sessionId }));

    const ctx = bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const entries = ctx!.experienceStore.list();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const success = entries.find((e) => e.type === "success");
    expect(success).toBeDefined();
    expect(success!.signal_type).toBe("uninterrupted_completion");
    ctx!.cleanup();
  });

  it("does nothing when no signals exist", () => {
    setupEnv();
    const sessionId = "end-s3";

    handleSessionEnd(JSON.stringify({ session_id: sessionId }));

    const ctx = bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const entries = ctx!.experienceStore.list();
    expect(entries).toHaveLength(0);
    ctx!.cleanup();
  });

  it("does nothing when mode is disabled", () => {
    setupEnv("disabled");
    handleSessionEnd(JSON.stringify({ session_id: "end-s4" }));
    // Should not throw
  });

  it("respects success_only mode filtering", () => {
    setupEnv("success_only");
    const sessionId = "end-s5";

    // Create interrupt signals → would generate failure entry
    handlePostToolUseFailure(
      JSON.stringify({
        session_id: sessionId,
        tool_name: "Bash",
        error: "err",
        is_interrupt: true,
      })
    );
    handleStop(JSON.stringify({ session_id: sessionId }));

    handleSessionEnd(JSON.stringify({ session_id: sessionId }));

    // In success_only mode, failure entries should be filtered out by listByMode
    const ctx = bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const entries = ctx!.experienceStore.listByMode();
    const failures = entries.filter((e) => e.type === "failure");
    expect(failures).toHaveLength(0);
    ctx!.cleanup();
  });
});
