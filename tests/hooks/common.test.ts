/**
 * Tests for src/hooks/_common.ts — common bootstrap module
 * Issue #37: feat(hooks): common bootstrap module for ACM hooks
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bootstrapHook, applyPluginOptionOverrides } from "../../src/hooks/_common.js";
import { DEFAULT_CONFIG } from "../../src/store/types.js";
import type { AcmConfig } from "../../src/store/types.js";

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

  it("returns context with DEFAULT_CONFIG when ACM_CONFIG_PATH is not set", async () => {
    delete process.env.ACM_CONFIG_PATH;
    const result = await bootstrapHook('{"session_id":"s1"}');
    expect(result).not.toBeNull();
    expect(result!.config.mode).toBe("full");
    expect(result!.config.top_k).toBe(5);
    expect(result!.config.capture_turns).toBe(5);
    expect(result!.config.promotion_threshold).toBe(0.3);
    result!.cleanup();
  });

  it("returns context with DEFAULT_CONFIG when ACM_CONFIG_PATH is empty string", async () => {
    process.env.ACM_CONFIG_PATH = "";
    const result = await bootstrapHook('{"session_id":"s1"}');
    expect(result).not.toBeNull();
    expect(result!.config.mode).toBe("full");
    result!.cleanup();
  });

  it("returns null when mode is disabled", async () => {
    const dbPath = join(TMP_DIR, "disabled.db");
    const configPath = createTempConfig({ mode: "disabled", db_path: dbPath });
    process.env.ACM_CONFIG_PATH = configPath;

    const result = await bootstrapHook('{"session_id":"s1"}');
    expect(result).toBeNull();
  });

  it("returns context when mode is full", async () => {
    const dbPath = join(TMP_DIR, "full.db");
    const configPath = createTempConfig({ mode: "full", db_path: dbPath });
    process.env.ACM_CONFIG_PATH = configPath;

    const result = await bootstrapHook('{"session_id":"s1"}');
    expect(result).not.toBeNull();
    expect(result!.input).toEqual({ session_id: "s1" });
    expect(result!.config.mode).toBe("full");
    expect(result!.signalStore).toBeDefined();
    expect(result!.experienceStore).toBeDefined();
    expect(result!.collector).toBeDefined();
  });

  it("returns context when mode is success_only", async () => {
    const dbPath = join(TMP_DIR, "success.db");
    const configPath = createTempConfig({ mode: "success_only", db_path: dbPath });
    process.env.ACM_CONFIG_PATH = configPath;

    const result = await bootstrapHook('{"session_id":"s1"}');
    expect(result).not.toBeNull();
    expect(result!.config.mode).toBe("success_only");
  });

  it("returns context when mode is failure_only", async () => {
    const dbPath = join(TMP_DIR, "failure.db");
    const configPath = createTempConfig({ mode: "failure_only", db_path: dbPath });
    process.env.ACM_CONFIG_PATH = configPath;

    const result = await bootstrapHook('{"session_id":"s1"}');
    expect(result).not.toBeNull();
    expect(result!.config.mode).toBe("failure_only");
  });

  it("throws on invalid JSON stdin", async () => {
    const dbPath = join(TMP_DIR, "parse.db");
    const configPath = createTempConfig({ mode: "full", db_path: dbPath });
    process.env.ACM_CONFIG_PATH = configPath;

    await expect(bootstrapHook("not json")).rejects.toThrow("Invalid JSON");
  });

  it("throws on empty stdin", async () => {
    const dbPath = join(TMP_DIR, "empty.db");
    const configPath = createTempConfig({ mode: "full", db_path: dbPath });
    process.env.ACM_CONFIG_PATH = configPath;

    await expect(bootstrapHook("")).rejects.toThrow("Invalid JSON");
  });

  it("parses complex input correctly", async () => {
    const dbPath = join(TMP_DIR, "complex.db");
    const configPath = createTempConfig({ mode: "full", db_path: dbPath });
    process.env.ACM_CONFIG_PATH = configPath;

    const input = JSON.stringify({
      session_id: "sess-123",
      tool_name: "Bash",
      error: "command failed",
      is_interrupt: true,
    });
    const result = await bootstrapHook(input);
    expect(result).not.toBeNull();
    expect(result!.input.session_id).toBe("sess-123");
    expect(result!.input.tool_name).toBe("Bash");
  });

  it("provides a properly initialized SignalCollector", async () => {
    const dbPath = join(TMP_DIR, "collector.db");
    const configPath = createTempConfig({
      mode: "full",
      db_path: dbPath,
      capture_turns: 3,
    });
    process.env.ACM_CONFIG_PATH = configPath;

    const result = await bootstrapHook('{"session_id":"s1"}');
    expect(result).not.toBeNull();

    // Verify collector works by recording a signal
    result!.collector.handleInterrupt("s1", "Bash", "test error");
    const signals = result!.signalStore.getBySession("s1");
    expect(signals).toHaveLength(1);
    expect(signals[0].event_type).toBe("interrupt");
  });

  it("derives projectName from cwd in input", async () => {
    const dbPath = join(TMP_DIR, "project.db");
    const configPath = createTempConfig({ mode: "full", db_path: dbPath });
    process.env.ACM_CONFIG_PATH = configPath;

    const result = await bootstrapHook(
      JSON.stringify({ session_id: "s1", cwd: "/home/user/my-project" })
    );
    expect(result).not.toBeNull();
    expect(result!.projectName).toBe("my-project");
  });

  it("defaults projectName to 'unknown' when cwd is missing", async () => {
    const dbPath = join(TMP_DIR, "no-cwd.db");
    const configPath = createTempConfig({ mode: "full", db_path: dbPath });
    process.env.ACM_CONFIG_PATH = configPath;

    const result = await bootstrapHook(JSON.stringify({ session_id: "s1" }));
    expect(result).not.toBeNull();
    expect(result!.projectName).toBe("unknown");
  });

  it("closes DB via cleanup function", async () => {
    const dbPath = join(TMP_DIR, "cleanup.db");
    const configPath = createTempConfig({ mode: "full", db_path: dbPath });
    process.env.ACM_CONFIG_PATH = configPath;

    const result = await bootstrapHook('{"session_id":"s1"}');
    expect(result).not.toBeNull();
    expect(() => result!.cleanup()).not.toThrow();
  });

  it("applies CLAUDE_PLUGIN_OPTION_* overrides to returned config", async () => {
    delete process.env.ACM_CONFIG_PATH;
    process.env.CLAUDE_PLUGIN_OPTION_VERBOSITY = "quiet";
    try {
      const result = await bootstrapHook('{"session_id":"s1"}');
      expect(result).not.toBeNull();
      expect(result!.config.verbosity).toBe("quiet");
      result!.cleanup();
    } finally {
      delete process.env.CLAUDE_PLUGIN_OPTION_VERBOSITY;
    }
  });
});

describe("applyPluginOptionOverrides", () => {
  function makeConfig(): AcmConfig {
    return { ...DEFAULT_CONFIG };
  }

  afterEach(() => {
    delete process.env.CLAUDE_PLUGIN_OPTION_OLLAMA_URL;
    delete process.env.CLAUDE_PLUGIN_OPTION_OLLAMA_MODEL;
    delete process.env.CLAUDE_PLUGIN_OPTION_VERBOSITY;
    delete process.env.CLAUDE_PLUGIN_OPTION_MAX_EXPERIENCES_PER_PROJECT;
    delete process.env.CLAUDE_PLUGIN_OPTION_INJECT_CORRECTIVE_BODIES_SCORE_THRESHOLD;
    delete process.env.CLAUDE_PLUGIN_OPTION_INJECT_CORRECTIVE_BODIES_MAX;
  });

  it("overrides ollama_url from env", () => {
    process.env.CLAUDE_PLUGIN_OPTION_OLLAMA_URL = "http://remote:11434";
    const config = makeConfig();
    applyPluginOptionOverrides(config);
    expect(config.ollama_url).toBe("http://remote:11434");
  });

  it("overrides ollama_model from env", () => {
    process.env.CLAUDE_PLUGIN_OPTION_OLLAMA_MODEL = "llama3:8b";
    const config = makeConfig();
    applyPluginOptionOverrides(config);
    expect(config.ollama_model).toBe("llama3:8b");
  });

  it("overrides verbosity from env", () => {
    process.env.CLAUDE_PLUGIN_OPTION_VERBOSITY = "verbose";
    const config = makeConfig();
    applyPluginOptionOverrides(config);
    expect(config.verbosity).toBe("verbose");
  });

  it("warns and ignores invalid verbosity value", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.CLAUDE_PLUGIN_OPTION_VERBOSITY = "invalid";
    const config = makeConfig();
    applyPluginOptionOverrides(config);
    expect(config.verbosity).toBe("normal");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("invalid value"));
    spy.mockRestore();
  });

  it("overrides max_experiences_per_project from env", () => {
    process.env.CLAUDE_PLUGIN_OPTION_MAX_EXPERIENCES_PER_PROJECT = "1000";
    const config = makeConfig();
    applyPluginOptionOverrides(config);
    expect(config.max_experiences_per_project).toBe(1000);
  });

  it("warns and ignores max_experiences_per_project below minimum", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.CLAUDE_PLUGIN_OPTION_MAX_EXPERIENCES_PER_PROJECT = "5";
    const config = makeConfig();
    applyPluginOptionOverrides(config);
    expect(config.max_experiences_per_project).toBe(500);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("invalid value"));
    spy.mockRestore();
  });

  it("warns and ignores float max_experiences_per_project", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.CLAUDE_PLUGIN_OPTION_MAX_EXPERIENCES_PER_PROJECT = "100.5";
    const config = makeConfig();
    applyPluginOptionOverrides(config);
    expect(config.max_experiences_per_project).toBe(500);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("invalid value"));
    spy.mockRestore();
  });

  it("warns and ignores non-numeric max_experiences_per_project", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.CLAUDE_PLUGIN_OPTION_MAX_EXPERIENCES_PER_PROJECT = "abc";
    const config = makeConfig();
    applyPluginOptionOverrides(config);
    expect(config.max_experiences_per_project).toBe(500);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("invalid value"));
    spy.mockRestore();
  });

  it("accepts max_experiences_per_project at boundary value 10", () => {
    process.env.CLAUDE_PLUGIN_OPTION_MAX_EXPERIENCES_PER_PROJECT = "10";
    const config = makeConfig();
    applyPluginOptionOverrides(config);
    expect(config.max_experiences_per_project).toBe(10);
  });

  it("ignores whitespace-only ollama_url", () => {
    process.env.CLAUDE_PLUGIN_OPTION_OLLAMA_URL = "   ";
    const config = makeConfig();
    applyPluginOptionOverrides(config);
    expect(config.ollama_url).toBeUndefined();
  });

  it("ignores whitespace-only ollama_model", () => {
    process.env.CLAUDE_PLUGIN_OPTION_OLLAMA_MODEL = "   ";
    const config = makeConfig();
    applyPluginOptionOverrides(config);
    expect(config.ollama_model).toBeUndefined();
  });

  it("overrides inject_corrective_bodies_score_threshold from env (#130)", () => {
    process.env.CLAUDE_PLUGIN_OPTION_INJECT_CORRECTIVE_BODIES_SCORE_THRESHOLD = "0.2";
    const config = makeConfig();
    applyPluginOptionOverrides(config);
    expect(config.inject_corrective_bodies_score_threshold).toBe(0.2);
  });

  it("accepts threshold 0 (always inline) as a valid override (#130)", () => {
    process.env.CLAUDE_PLUGIN_OPTION_INJECT_CORRECTIVE_BODIES_SCORE_THRESHOLD = "0";
    const config = makeConfig();
    applyPluginOptionOverrides(config);
    expect(config.inject_corrective_bodies_score_threshold).toBe(0);
  });

  it("warns and ignores out-of-range threshold (#130)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.CLAUDE_PLUGIN_OPTION_INJECT_CORRECTIVE_BODIES_SCORE_THRESHOLD = "10";
    const config = makeConfig();
    applyPluginOptionOverrides(config);
    expect(config.inject_corrective_bodies_score_threshold).toBe(0.6);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("invalid value"));
    spy.mockRestore();
  });

  it("overrides inject_corrective_bodies_max from env (#130)", () => {
    process.env.CLAUDE_PLUGIN_OPTION_INJECT_CORRECTIVE_BODIES_MAX = "5";
    const config = makeConfig();
    applyPluginOptionOverrides(config);
    expect(config.inject_corrective_bodies_max).toBe(5);
  });

  it("warns and ignores non-integer max bodies (#130)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.CLAUDE_PLUGIN_OPTION_INJECT_CORRECTIVE_BODIES_MAX = "2.5";
    const config = makeConfig();
    applyPluginOptionOverrides(config);
    expect(config.inject_corrective_bodies_max).toBe(3);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("invalid value"));
    spy.mockRestore();
  });

  it("does not override when env vars are not set", () => {
    const config = makeConfig();
    applyPluginOptionOverrides(config);
    expect(config.ollama_url).toBeUndefined();
    expect(config.ollama_model).toBeUndefined();
    expect(config.verbosity).toBe("normal");
    expect(config.max_experiences_per_project).toBe(500);
  });
});
