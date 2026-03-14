/**
 * Tests for src/hooks/_common.ts — common bootstrap module
 * Issue #37: feat(hooks): common bootstrap module for ACM hooks
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bootstrapHook } from "../../src/hooks/_common.js";

const TMP_DIR = join(tmpdir(), "acm-test-hooks-common");

function createTempConfig(config: Record<string, unknown>): string {
  mkdirSync(TMP_DIR, { recursive: true });
  const configPath = join(TMP_DIR, "acm-config.json");
  writeFileSync(configPath, JSON.stringify(config));
  return configPath;
}

describe("bootstrapHook", () => {
  const originalEnv = process.env.ACM_CONFIG_PATH;

  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    process.env.ACM_CONFIG_PATH = originalEnv;
    try {
      rmSync(TMP_DIR, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("returns context with DEFAULT_CONFIG when ACM_CONFIG_PATH is not set", () => {
    delete process.env.ACM_CONFIG_PATH;
    const result = bootstrapHook('{"session_id":"s1"}');
    expect(result).not.toBeNull();
    expect(result!.config.mode).toBe("full");
    expect(result!.config.top_k).toBe(5);
    expect(result!.config.capture_turns).toBe(5);
    expect(result!.config.promotion_threshold).toBe(0.3);
    result!.cleanup();
  });

  it("returns context with DEFAULT_CONFIG when ACM_CONFIG_PATH is empty string", () => {
    process.env.ACM_CONFIG_PATH = "";
    const result = bootstrapHook('{"session_id":"s1"}');
    expect(result).not.toBeNull();
    expect(result!.config.mode).toBe("full");
    result!.cleanup();
  });

  it("returns null when mode is disabled", () => {
    const dbPath = join(TMP_DIR, "disabled.db");
    const configPath = createTempConfig({ mode: "disabled", db_path: dbPath });
    process.env.ACM_CONFIG_PATH = configPath;

    const result = bootstrapHook('{"session_id":"s1"}');
    expect(result).toBeNull();
  });

  it("returns context when mode is full", () => {
    const dbPath = join(TMP_DIR, "full.db");
    const configPath = createTempConfig({ mode: "full", db_path: dbPath });
    process.env.ACM_CONFIG_PATH = configPath;

    const result = bootstrapHook('{"session_id":"s1"}');
    expect(result).not.toBeNull();
    expect(result!.input).toEqual({ session_id: "s1" });
    expect(result!.config.mode).toBe("full");
    expect(result!.signalStore).toBeDefined();
    expect(result!.experienceStore).toBeDefined();
    expect(result!.collector).toBeDefined();
  });

  it("returns context when mode is success_only", () => {
    const dbPath = join(TMP_DIR, "success.db");
    const configPath = createTempConfig({ mode: "success_only", db_path: dbPath });
    process.env.ACM_CONFIG_PATH = configPath;

    const result = bootstrapHook('{"session_id":"s1"}');
    expect(result).not.toBeNull();
    expect(result!.config.mode).toBe("success_only");
  });

  it("returns context when mode is failure_only", () => {
    const dbPath = join(TMP_DIR, "failure.db");
    const configPath = createTempConfig({ mode: "failure_only", db_path: dbPath });
    process.env.ACM_CONFIG_PATH = configPath;

    const result = bootstrapHook('{"session_id":"s1"}');
    expect(result).not.toBeNull();
    expect(result!.config.mode).toBe("failure_only");
  });

  it("throws on invalid JSON stdin", () => {
    const dbPath = join(TMP_DIR, "parse.db");
    const configPath = createTempConfig({ mode: "full", db_path: dbPath });
    process.env.ACM_CONFIG_PATH = configPath;

    expect(() => bootstrapHook("not json")).toThrow("Invalid JSON");
  });

  it("throws on empty stdin", () => {
    const dbPath = join(TMP_DIR, "empty.db");
    const configPath = createTempConfig({ mode: "full", db_path: dbPath });
    process.env.ACM_CONFIG_PATH = configPath;

    expect(() => bootstrapHook("")).toThrow("Invalid JSON");
  });

  it("parses complex input correctly", () => {
    const dbPath = join(TMP_DIR, "complex.db");
    const configPath = createTempConfig({ mode: "full", db_path: dbPath });
    process.env.ACM_CONFIG_PATH = configPath;

    const input = JSON.stringify({
      session_id: "sess-123",
      tool_name: "Bash",
      error: "command failed",
      is_interrupt: true,
    });
    const result = bootstrapHook(input);
    expect(result).not.toBeNull();
    expect(result!.input.session_id).toBe("sess-123");
    expect(result!.input.tool_name).toBe("Bash");
  });

  it("provides a properly initialized SignalCollector", () => {
    const dbPath = join(TMP_DIR, "collector.db");
    const configPath = createTempConfig({
      mode: "full",
      db_path: dbPath,
      capture_turns: 3,
    });
    process.env.ACM_CONFIG_PATH = configPath;

    const result = bootstrapHook('{"session_id":"s1"}');
    expect(result).not.toBeNull();

    // Verify collector works by recording a signal
    result!.collector.handleInterrupt("s1", "Bash", "test error");
    const signals = result!.signalStore.getBySession("s1");
    expect(signals).toHaveLength(1);
    expect(signals[0].event_type).toBe("interrupt");
  });

  it("derives projectName from cwd in input", () => {
    const dbPath = join(TMP_DIR, "project.db");
    const configPath = createTempConfig({ mode: "full", db_path: dbPath });
    process.env.ACM_CONFIG_PATH = configPath;

    const result = bootstrapHook(
      JSON.stringify({ session_id: "s1", cwd: "/home/user/my-project" })
    );
    expect(result).not.toBeNull();
    expect(result!.projectName).toBe("my-project");
  });

  it("defaults projectName to 'unknown' when cwd is missing", () => {
    const dbPath = join(TMP_DIR, "no-cwd.db");
    const configPath = createTempConfig({ mode: "full", db_path: dbPath });
    process.env.ACM_CONFIG_PATH = configPath;

    const result = bootstrapHook(JSON.stringify({ session_id: "s1" }));
    expect(result).not.toBeNull();
    expect(result!.projectName).toBe("unknown");
  });

  it("closes DB via cleanup function", () => {
    const dbPath = join(TMP_DIR, "cleanup.db");
    const configPath = createTempConfig({ mode: "full", db_path: dbPath });
    process.env.ACM_CONFIG_PATH = configPath;

    const result = bootstrapHook('{"session_id":"s1"}');
    expect(result).not.toBeNull();
    expect(() => result!.cleanup()).not.toThrow();
  });
});
