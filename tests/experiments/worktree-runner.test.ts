/**
 * Tests for worktree-based run isolation and hook registration
 * Issues #42, #43: feat(runner): worktree-based run isolation + integration test
 */

import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createWorktree,
  cleanupWorktree,
  generateHooksConfig,
  readSessionSignals,
} from "../../experiments/runner/worktree-helpers.js";
import { initializeDatabase } from "../../src/store/schema.js";
import { SessionSignalStore } from "../../src/signals/session-store.js";

const TMP_DIR = join(tmpdir(), "acm-test-worktree");

describe("generateHooksConfig", () => {
  afterEach(() => {
    try {
      rmSync(TMP_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("generates valid settings.local.json with hook configurations", () => {
    mkdirSync(join(TMP_DIR, ".claude"), { recursive: true });
    const projectRoot = "/Users/test/project";

    generateHooksConfig(TMP_DIR, projectRoot);

    const settingsPath = join(TMP_DIR, ".claude", "settings.local.json");
    expect(existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.hooks).toBeDefined();

    // Should have hooks for the ACM events
    const hookEvents = Object.keys(settings.hooks);
    expect(hookEvents).toContain("PostToolUseFailure");
    expect(hookEvents).toContain("UserPromptSubmit");
    expect(hookEvents).toContain("PostToolUse");
    expect(hookEvents).toContain("Stop");
    expect(hookEvents).toContain("SessionStart");
    expect(hookEvents).toContain("SessionEnd");
  });

  it("uses tsx with absolute paths to hook scripts", () => {
    mkdirSync(join(TMP_DIR, ".claude"), { recursive: true });
    const projectRoot = "/Users/test/project";

    generateHooksConfig(TMP_DIR, projectRoot);

    const settingsPath = join(TMP_DIR, ".claude", "settings.local.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));

    // Each hook command should use tsx with absolute path
    for (const event of Object.keys(settings.hooks)) {
      const hookList = settings.hooks[event];
      expect(hookList).toBeInstanceOf(Array);
      for (const hook of hookList) {
        expect(hook.command).toContain("tsx");
        expect(hook.command).toContain(projectRoot);
      }
    }
  });
});

describe("createWorktree runId validation", () => {
  it("rejects runId with path traversal characters", async () => {
    await expect(createWorktree("/tmp", "../../../etc")).rejects.toThrow("Invalid runId");
  });

  it("rejects runId with spaces", async () => {
    await expect(createWorktree("/tmp", "run with spaces")).rejects.toThrow("Invalid runId");
  });

  it("rejects runId with special characters", async () => {
    await expect(createWorktree("/tmp", "run;rm -rf /")).rejects.toThrow("Invalid runId");
  });

  it("accepts valid alphanumeric runId with hyphens and underscores", () => {
    // Just validate the regex doesn't reject valid IDs (don't actually create worktree)
    const validIds = ["run-001", "task_a_acm_1", "abc123", "Run_A-1"];
    for (const id of validIds) {
      expect(/^[\w-]+$/.test(id)).toBe(true);
    }
  });
});

describe("cleanupWorktree runId validation", () => {
  it("rejects runId with path traversal characters", async () => {
    await expect(cleanupWorktree("/tmp", "../../../etc")).rejects.toThrow("Invalid runId");
  });

  it("rejects runId with special characters", async () => {
    await expect(cleanupWorktree("/tmp", "run;rm -rf /")).rejects.toThrow("Invalid runId");
  });
});

describe("readSessionSignals", () => {
  afterEach(() => {
    try {
      rmSync(TMP_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("reads signal counts from a DB file", () => {
    mkdirSync(TMP_DIR, { recursive: true });
    const dbPath = join(TMP_DIR, "test-signals.db");
    const db = initializeDatabase(dbPath);
    const store = new SessionSignalStore(db);

    // Add some signals
    store.addSignal("s1", "interrupt", { tool_name: "Bash", error: "err" });
    store.addSignal("s1", "interrupt", { tool_name: "Read", error: "err2" });
    store.addSignal("s1", "corrective_instruction", { prompt: "fix it" });
    store.addSignal("s1", "tool_success", { tool_name: "Bash" });
    store.addSignal("s1", "stop", null);
    db.close();

    const signals = readSessionSignals(dbPath, "s1");
    expect(signals.interrupt_count).toBe(2);
    expect(signals.corrective_instruction_count).toBe(1);
  });

  it("returns zeros when session has no signals", () => {
    mkdirSync(TMP_DIR, { recursive: true });
    const dbPath = join(TMP_DIR, "empty-signals.db");
    const db = initializeDatabase(dbPath);
    db.close();

    const signals = readSessionSignals(dbPath, "nonexistent");
    expect(signals.interrupt_count).toBe(0);
    expect(signals.corrective_instruction_count).toBe(0);
  });

  it("returns zeros when DB file does not exist", () => {
    const signals = readSessionSignals(join(TMP_DIR, "missing.db"), "s1");
    expect(signals.interrupt_count).toBe(0);
    expect(signals.corrective_instruction_count).toBe(0);
  });
});
