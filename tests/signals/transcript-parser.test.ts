/**
 * Tests for TranscriptParser — JSONL transcript parsing
 * Issue #83: transcript-based corrective instruction detection
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseTranscript } from "../../src/signals/transcript-parser.js";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `acm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Helper to create a JSONL transcript file
function writeTranscript(dir: string, lines: unknown[]): string {
  const path = join(dir, "transcript.jsonl");
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return path;
}

// Factory helpers for transcript entries
function userMessage(
  text: string,
  opts: { permissionMode?: string; uuid?: string; promptId?: string } = {}
) {
  return {
    type: "user",
    uuid: opts.uuid ?? `uuid-${Math.random().toString(36).slice(2)}`,
    parentUuid: null,
    timestamp: new Date().toISOString(),
    permissionMode: opts.permissionMode ?? "default",
    promptId: opts.promptId ?? `prompt-${Math.random().toString(36).slice(2)}`,
    message: { role: "user", content: [{ type: "text", text }] },
  };
}

function interruptMessage(forToolUse = false) {
  const text = forToolUse
    ? "[Request interrupted by user for tool use]"
    : "[Request interrupted by user]";
  return {
    type: "user",
    uuid: `uuid-${Math.random().toString(36).slice(2)}`,
    parentUuid: null,
    timestamp: new Date().toISOString(),
    message: { role: "user", content: [{ type: "text", text }] },
  };
}

function assistantMessage(text: string) {
  return {
    type: "assistant",
    uuid: `uuid-${Math.random().toString(36).slice(2)}`,
    parentUuid: null,
    timestamp: new Date().toISOString(),
    message: { role: "assistant", content: [{ type: "text", text }] },
  };
}

function toolResult() {
  return {
    type: "tool_result",
    uuid: `uuid-${Math.random().toString(36).slice(2)}`,
    parentUuid: null,
    timestamp: new Date().toISOString(),
  };
}

describe("TranscriptParser", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("parseTranscript", () => {
    it("extracts real user messages via permissionMode field", () => {
      const path = writeTranscript(tmpDir, [
        userMessage("Hello, help me with this"),
        assistantMessage("Sure, I can help"),
        toolResult(),
        userMessage("Now do tests"),
      ]);

      const result = parseTranscript(path);
      expect(result.totalHumanMessages).toBe(2);
      expect(result.turns).toHaveLength(2);
      expect(result.turns[0].humanMessage.text).toBe("Hello, help me with this");
      expect(result.turns[1].humanMessage.text).toBe("Now do tests");
    });

    it("filters out non-user entries (assistant, tool_result, etc.)", () => {
      const path = writeTranscript(tmpDir, [
        assistantMessage("I'll help"),
        toolResult(),
        { type: "summary", uuid: "x", timestamp: new Date().toISOString() },
        userMessage("One real message"),
      ]);

      const result = parseTranscript(path);
      expect(result.totalHumanMessages).toBe(1);
      expect(result.turns).toHaveLength(1);
    });

    it("filters out user entries without permissionMode (tool results injected as user type)", () => {
      const path = writeTranscript(tmpDir, [
        userMessage("Real message"),
        // user-type entry without permissionMode (e.g. tool result feedback)
        {
          type: "user",
          uuid: "tool-feedback",
          parentUuid: null,
          timestamp: new Date().toISOString(),
          message: {
            role: "user",
            content: [{ type: "tool_result", tool_use_id: "x", content: "ok" }],
          },
        },
      ]);

      const result = parseTranscript(path);
      expect(result.totalHumanMessages).toBe(1);
    });

    it("detects interrupts", () => {
      const path = writeTranscript(tmpDir, [
        userMessage("Do something"),
        assistantMessage("Working..."),
        interruptMessage(),
        userMessage("No, do it differently"),
      ]);

      const result = parseTranscript(path);
      expect(result.interruptCount).toBe(1);
      expect(result.turns).toHaveLength(2);
    });

    it("marks turns after interrupt as isAfterInterrupt", () => {
      const path = writeTranscript(tmpDir, [
        userMessage("Start task"),
        assistantMessage("Working..."),
        interruptMessage(),
        userMessage("Changed my mind, do X instead"),
      ]);

      const result = parseTranscript(path);
      expect(result.turns[0].isAfterInterrupt).toBe(false);
      expect(result.turns[1].isAfterInterrupt).toBe(true);
    });

    it("detects tool-use interrupts", () => {
      const path = writeTranscript(tmpDir, [
        userMessage("Run the build"),
        interruptMessage(true),
        userMessage("Cancel that"),
      ]);

      const result = parseTranscript(path);
      expect(result.interruptCount).toBe(1);
      expect(result.turns[1].isAfterInterrupt).toBe(true);
    });

    it("handles multiple interrupts", () => {
      const path = writeTranscript(tmpDir, [
        userMessage("Task 1"),
        interruptMessage(),
        userMessage("Task 2"),
        interruptMessage(),
        userMessage("Task 3"),
      ]);

      const result = parseTranscript(path);
      expect(result.interruptCount).toBe(2);
      expect(result.turns[0].isAfterInterrupt).toBe(false);
      expect(result.turns[1].isAfterInterrupt).toBe(true);
      expect(result.turns[2].isAfterInterrupt).toBe(true);
    });

    it("handles message content as string", () => {
      const path = writeTranscript(tmpDir, [
        {
          type: "user",
          uuid: "u1",
          parentUuid: null,
          timestamp: new Date().toISOString(),
          permissionMode: "default",
          promptId: "p1",
          message: { role: "user", content: "Plain string content" },
        },
      ]);

      const result = parseTranscript(path);
      expect(result.turns[0].humanMessage.text).toBe("Plain string content");
    });

    it("handles message content as array with multiple text blocks", () => {
      const path = writeTranscript(tmpDir, [
        {
          type: "user",
          uuid: "u1",
          parentUuid: null,
          timestamp: new Date().toISOString(),
          permissionMode: "default",
          promptId: "p1",
          message: {
            role: "user",
            content: [
              { type: "text", text: "First part" },
              { type: "image", source: {} },
              { type: "text", text: "Second part" },
            ],
          },
        },
      ]);

      const result = parseTranscript(path);
      expect(result.turns[0].humanMessage.text).toBe("First part\nSecond part");
    });

    it("assigns sequential turn indices", () => {
      const path = writeTranscript(tmpDir, [
        userMessage("First"),
        userMessage("Second"),
        userMessage("Third"),
      ]);

      const result = parseTranscript(path);
      expect(result.turns.map((t) => t.index)).toEqual([0, 1, 2]);
    });

    it("returns empty result for non-existent file", () => {
      const result = parseTranscript("/nonexistent/path.jsonl");
      expect(result.turns).toHaveLength(0);
      expect(result.totalHumanMessages).toBe(0);
      expect(result.interruptCount).toBe(0);
    });

    it("returns empty result for empty file", () => {
      const path = join(tmpDir, "empty.jsonl");
      writeFileSync(path, "");

      const result = parseTranscript(path);
      expect(result.turns).toHaveLength(0);
    });

    it("skips malformed JSON lines gracefully", () => {
      const path = join(tmpDir, "bad.jsonl");
      const goodLine = JSON.stringify(userMessage("Valid message"));
      writeFileSync(path, `${goodLine}\n{invalid json}\n${goodLine}\n`);

      const result = parseTranscript(path);
      // Should parse the valid lines and skip the bad one
      expect(result.totalHumanMessages).toBe(2);
    });

    it("preserves uuid and promptId from transcript entries", () => {
      const path = writeTranscript(tmpDir, [
        userMessage("Test", { uuid: "my-uuid", promptId: "my-prompt" }),
      ]);

      const result = parseTranscript(path);
      expect(result.turns[0].humanMessage.uuid).toBe("my-uuid");
      expect(result.turns[0].humanMessage.promptId).toBe("my-prompt");
    });

    it("handles acceptEdits permissionMode", () => {
      const path = writeTranscript(tmpDir, [
        userMessage("With acceptEdits", { permissionMode: "acceptEdits" }),
      ]);

      const result = parseTranscript(path);
      expect(result.totalHumanMessages).toBe(1);
    });
  });
});
