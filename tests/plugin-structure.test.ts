/**
 * Plugin structure validation tests — Issue #94
 *
 * Validates that plugin.json, hooks.json, and command files
 * conform to the expected Claude Code plugin format.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? ".", "..");
const HOOKS_DIR = join(ROOT, "hooks");
const COMMANDS_DIR = join(ROOT, "commands");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

// Read once at module level — fails fast if file is missing
const pluginPath = join(ROOT, ".claude-plugin", "plugin.json");
const plugin = readJson(pluginPath) as Record<string, unknown>;

describe("plugin.json", () => {
  it("has required top-level fields", () => {
    expect(plugin.name).toBe("acm");
    expect(plugin.description).toBeTruthy();
    expect(plugin.mcpServers).toBeDefined();
    // hooks and commands use auto-discovery (no explicit manifest keys needed)
  });

  it("has author with correct name", () => {
    const author = plugin.author as Record<string, unknown>;
    expect(author.name).toBe("Signal compose");
  });

  it("has userConfig with expected keys", () => {
    const userConfig = plugin.userConfig as Record<string, unknown>;
    expect(userConfig).toBeDefined();

    const expectedKeys = ["ollama_url", "ollama_model", "verbosity", "max_experiences_per_project"];
    for (const key of expectedKeys) {
      expect(userConfig[key]).toBeDefined();
      const entry = userConfig[key] as Record<string, unknown>;
      expect(entry.description).toBeTruthy();
    }
  });

  it("marks no userConfig keys as sensitive", () => {
    const userConfig = plugin.userConfig as Record<string, unknown>;
    for (const [, value] of Object.entries(userConfig)) {
      const entry = value as Record<string, unknown>;
      expect(entry.sensitive).not.toBe(true);
    }
  });
});

describe("hooks.json", () => {
  const hooksPath = join(HOOKS_DIR, "hooks.json");

  it("exists and is valid JSON", () => {
    expect(existsSync(hooksPath)).toBe(true);
    const hooks = readJson(hooksPath) as Record<string, unknown>;
    expect(hooks.hooks).toBeDefined();
  });

  it("declares all required hook events", () => {
    const hooks = readJson(hooksPath) as Record<string, unknown>;
    const hookEvents = hooks.hooks as Record<string, unknown>;
    const requiredEvents = [
      "SessionStart",
      "Stop",
      "SessionEnd",
      "PreCompact",
      "UserPromptSubmit",
      "PostToolUse",
      "PostToolUseFailure",
    ];
    for (const event of requiredEvents) {
      expect(hookEvents[event]).toBeDefined();
    }
  });
});

describe("commands", () => {
  it("has report command", () => {
    const cmdPath = join(COMMANDS_DIR, "report.md");
    expect(existsSync(cmdPath)).toBe(true);
    const content = readFileSync(cmdPath, "utf-8");
    // Frontmatter check
    expect(content).toMatch(/^---\n/);
    expect(content).toMatch(/description:/);
    // Should reference acm_report MCP tool
    expect(content).toContain("acm_report");
  });

  it("has health command", () => {
    const cmdPath = join(COMMANDS_DIR, "health.md");
    expect(existsSync(cmdPath)).toBe(true);
    const content = readFileSync(cmdPath, "utf-8");
    expect(content).toMatch(/^---\n/);
    expect(content).toMatch(/description:/);
    // Should reference acm_health MCP tool
    expect(content).toContain("acm_health");
  });
});
