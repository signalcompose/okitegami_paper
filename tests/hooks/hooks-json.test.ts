/**
 * Tests for hooks/hooks.json — hook event mapping validation
 * Verifies that hooks.json is valid and all hook scripts exist in dist/hooks/
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const HOOKS_JSON_PATH = join(__dirname, "../../hooks/hooks.json");

interface HookEntry {
  type: string;
  command: string;
  timeout: number;
}

interface HookMatcher {
  matcher: string;
  hooks: HookEntry[];
}

interface HooksConfig {
  description: string;
  hooks: Record<string, HookMatcher[]>;
}

describe("hooks/hooks.json", () => {
  let config: HooksConfig;

  beforeAll(() => {
    const raw = readFileSync(HOOKS_JSON_PATH, "utf-8");
    config = JSON.parse(raw) as HooksConfig;
  });

  it("is valid JSON", () => {
    expect(config).toBeDefined();
  });

  it("has a description field", () => {
    expect(config.description).toBeTruthy();
  });

  it("maps all 6 hook scripts", () => {
    // Collect all script names from commands
    const scriptNames = new Set<string>();
    for (const matchers of Object.values(config.hooks)) {
      for (const matcher of matchers) {
        for (const hook of matcher.hooks) {
          const match = hook.command.match(/dist\/hooks\/(.+\.js)$/);
          if (match) {
            scriptNames.add(match[1]);
          }
        }
      }
    }

    expect(scriptNames).toEqual(
      new Set([
        "session-start.js",
        "stop.js",
        "session-end.js",
        "post-tool-use.js",
        "post-tool-use-failure.js",
        "user-prompt-submit.js",
      ])
    );
  });

  it("maps to correct Claude Code hook events", () => {
    const events = Object.keys(config.hooks);
    expect(events).toContain("SessionStart");
    expect(events).toContain("Stop");
    expect(events).toContain("PostToolUse");
    expect(events).toContain("PostToolUseFailure");
    expect(events).toContain("UserPromptSubmit");
  });

  it("has corresponding source files for each hook script", () => {
    const srcDir = join(__dirname, "../../src/hooks");
    for (const matchers of Object.values(config.hooks)) {
      for (const matcher of matchers) {
        for (const hook of matcher.hooks) {
          const match = hook.command.match(/dist\/hooks\/(.+)\.js$/);
          if (match) {
            const srcFile = join(srcDir, `${match[1]}.ts`);
            expect(existsSync(srcFile), `Source file missing: ${srcFile}`).toBe(true);
          }
        }
      }
    }
  });

  it("has appropriate timeouts", () => {
    for (const [event, matchers] of Object.entries(config.hooks)) {
      for (const matcher of matchers) {
        for (const hook of matcher.hooks) {
          expect(hook.timeout, `${event} timeout should be positive`).toBeGreaterThan(0);
          expect(hook.timeout, `${event} timeout should not exceed 30s`).toBeLessThanOrEqual(30000);
        }
      }
    }

    // SessionStart should have higher timeout for ONNX model loading
    const sessionStartTimeout = config.hooks.SessionStart[0].hooks[0].timeout;
    expect(sessionStartTimeout).toBeGreaterThanOrEqual(10000);
  });

  it("has correct PostToolUse matcher for common tools", () => {
    const matcher = config.hooks.PostToolUse[0].matcher;
    expect(matcher).toContain("Bash");
    expect(matcher).toContain("Edit");
    expect(matcher).toContain("Write");
    expect(matcher).toContain("Read");
  });

  it("all hook entries use command type", () => {
    for (const matchers of Object.values(config.hooks)) {
      for (const matcher of matchers) {
        for (const hook of matcher.hooks) {
          expect(hook.type).toBe("command");
        }
      }
    }
  });

  it("Stop event has both stop.js and session-end.js in order", () => {
    const stopMatchers = config.hooks.Stop;
    expect(stopMatchers).toHaveLength(2);

    const firstCommand = stopMatchers[0].hooks[0].command;
    const secondCommand = stopMatchers[1].hooks[0].command;
    expect(firstCommand).toContain("stop.js");
    expect(secondCommand).toContain("session-end.js");
  });
});
