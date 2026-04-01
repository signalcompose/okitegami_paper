/**
 * Tests for signal recording hooks
 * Issue #38: feat(hooks): signal recording hooks — interrupt, prompt, tool success, stop
 */

import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handlePostToolUseFailure } from "../../src/hooks/post-tool-use-failure.js";
import { handleUserPromptSubmit } from "../../src/hooks/user-prompt-submit.js";
import { handlePostToolUse } from "../../src/hooks/post-tool-use.js";
import { handleStop } from "../../src/hooks/stop.js";
import { bootstrapHook } from "../../src/hooks/_common.js";

const TMP_DIR = join(tmpdir(), "acm-test-signal-hooks");

function setupEnv(mode: string = "full"): string {
  mkdirSync(TMP_DIR, { recursive: true });
  const dbPath = join(TMP_DIR, `test-${Date.now()}.db`);
  const configPath = join(TMP_DIR, `config-${Date.now()}.json`);
  writeFileSync(configPath, JSON.stringify({ mode, db_path: dbPath }));
  process.env.ACM_CONFIG_PATH = configPath;
  return dbPath;
}

describe("post-tool-use-failure hook", () => {
  const originalEnv = process.env.ACM_CONFIG_PATH;

  afterEach(() => {
    process.env.ACM_CONFIG_PATH = originalEnv;
    try {
      rmSync(TMP_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("records interrupt signal to DB", async () => {
    setupEnv();
    const stdin = JSON.stringify({
      session_id: "s1",
      tool_name: "Bash",
      error: "command not found",
      is_interrupt: true,
    });
    await handlePostToolUseFailure(stdin);

    // Verify via bootstrap
    const ctx = await bootstrapHook('{"session_id":"s1"}');
    const signals = ctx!.signalStore.getBySession("s1");
    expect(signals).toHaveLength(1);
    expect(signals[0].event_type).toBe("interrupt");
    expect(signals[0].data?.tool_name).toBe("Bash");
    ctx!.cleanup();
  });

  it("does nothing when mode is disabled", async () => {
    setupEnv("disabled");
    const stdin = JSON.stringify({
      session_id: "s1",
      tool_name: "Bash",
      error: "err",
      is_interrupt: true,
    });
    // Should not throw
    await handlePostToolUseFailure(stdin);
  });

  it("throws when is_interrupt is not a boolean", async () => {
    setupEnv();
    const stdin = JSON.stringify({
      session_id: "s1",
      tool_name: "Bash",
      error: "err",
      // is_interrupt missing
    });
    await expect(handlePostToolUseFailure(stdin)).rejects.toThrow(
      '"is_interrupt" must be a boolean'
    );
  });

  it("records tool_failure for non-interrupt failures", async () => {
    setupEnv();
    const stdin = JSON.stringify({
      session_id: "s1",
      tool_name: "Bash",
      error: "command not found",
      is_interrupt: false,
    });
    await handlePostToolUseFailure(stdin);

    const ctx = await bootstrapHook('{"session_id":"s1"}');
    const signals = ctx!.signalStore.getBySession("s1");
    expect(signals).toHaveLength(1);
    expect(signals[0].event_type).toBe("tool_failure");
    expect(signals[0].data?.tool_name).toBe("Bash");
    expect(signals[0].data?.error).toBe("command not found");
    ctx!.cleanup();
  });
});

describe("user-prompt-submit hook", () => {
  const originalEnv = process.env.ACM_CONFIG_PATH;

  afterEach(() => {
    process.env.ACM_CONFIG_PATH = originalEnv;
    try {
      rmSync(TMP_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("records user prompt after interrupt", async () => {
    setupEnv();
    // First create an interrupt
    await handlePostToolUseFailure(
      JSON.stringify({
        session_id: "s2",
        tool_name: "Bash",
        error: "err",
        is_interrupt: true,
      })
    );
    // Then submit user prompt
    await handleUserPromptSubmit(
      JSON.stringify({
        session_id: "s2",
        prompt: "No, do it differently",
      })
    );

    const ctx = await bootstrapHook('{"session_id":"s2"}');
    const signals = ctx!.signalStore.getBySession("s2");
    expect(signals.length).toBeGreaterThanOrEqual(2);
    const postInterrupt = signals.find((s) => s.event_type === "post_interrupt_turn");
    expect(postInterrupt).toBeDefined();
    ctx!.cleanup();
  });

  it("does not auto-detect corrective instruction (delegated to Claude)", async () => {
    setupEnv();
    await handleUserPromptSubmit(
      JSON.stringify({
        session_id: "s3",
        prompt: "No, that's wrong. Use the other approach instead.",
      })
    );

    const ctx = await bootstrapHook('{"session_id":"s3"}');
    const signals = ctx!.signalStore.getBySession("s3");
    const corrective = signals.find((s) => s.event_type === "corrective_instruction");
    expect(corrective).toBeUndefined();
    ctx!.cleanup();
  });

  it("does nothing when mode is disabled", async () => {
    setupEnv("disabled");
    await handleUserPromptSubmit(JSON.stringify({ session_id: "s4", prompt: "hello" }));
  });
});

describe("post-tool-use hook", () => {
  const originalEnv = process.env.ACM_CONFIG_PATH;

  afterEach(() => {
    process.env.ACM_CONFIG_PATH = originalEnv;
    try {
      rmSync(TMP_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("records tool success signal", async () => {
    setupEnv();
    await handlePostToolUse(
      JSON.stringify({
        session_id: "s5",
        tool_name: "Bash",
        tool_input: { command: "ls -la" },
        result: "file1.txt",
      })
    );

    const ctx = await bootstrapHook('{"session_id":"s5"}');
    const signals = ctx!.signalStore.getBySession("s5");
    expect(signals).toHaveLength(1);
    expect(signals[0].event_type).toBe("tool_success");
    expect(signals[0].data?.tool_name).toBe("Bash");
    ctx!.cleanup();
  });

  it("detects test runner success", async () => {
    setupEnv();
    await handlePostToolUse(
      JSON.stringify({
        session_id: "s6",
        tool_name: "Bash",
        tool_input: { command: "npx vitest run" },
        result: "Tests passed",
        exit_code: 0,
      })
    );

    const ctx = await bootstrapHook('{"session_id":"s6"}');
    expect(ctx!.signalStore.hasTestPass("s6")).toBe(true);
    ctx!.cleanup();
  });

  it("handles missing tool_input gracefully", async () => {
    setupEnv();
    await handlePostToolUse(
      JSON.stringify({
        session_id: "s6b",
        tool_name: "Read",
        result: "file contents",
      })
    );

    const ctx = await bootstrapHook('{"session_id":"s6b"}');
    const signals = ctx!.signalStore.getBySession("s6b");
    expect(signals).toHaveLength(1);
    expect(signals[0].event_type).toBe("tool_success");
    ctx!.cleanup();
  });

  it("does nothing when mode is disabled", async () => {
    setupEnv("disabled");
    await handlePostToolUse(
      JSON.stringify({
        session_id: "s7",
        tool_name: "Bash",
        tool_input: { command: "ls" },
        result: "",
      })
    );
  });
});

describe("stop hook", () => {
  const originalEnv = process.env.ACM_CONFIG_PATH;

  afterEach(() => {
    process.env.ACM_CONFIG_PATH = originalEnv;
    try {
      rmSync(TMP_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("records stop signal with last_assistant_message", async () => {
    setupEnv();
    await handleStop(
      JSON.stringify({
        session_id: "s8",
        last_assistant_message: "Task completed. All tests passing.",
      })
    );

    const ctx = await bootstrapHook('{"session_id":"s8"}');
    const signals = ctx!.signalStore.getBySession("s8");
    expect(signals).toHaveLength(1);
    expect(signals[0].event_type).toBe("stop");
    ctx!.cleanup();
  });

  it("does nothing when mode is disabled", async () => {
    setupEnv("disabled");
    await handleStop(JSON.stringify({ session_id: "s9" }));
  });
});
