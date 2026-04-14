/**
 * Tests for JSONL operational logger (Issue #89)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JsonlLogger, type LogCategory } from "../../src/logging/jsonl-logger.js";

const TEST_DIR = join(
  tmpdir(),
  `acm-test-jsonl-${Date.now()}-${Math.random().toString(36).slice(2)}`
);

function readLogLines(dir: string): Array<Record<string, unknown>> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  const lines: Array<Record<string, unknown>> = [];
  for (const file of files) {
    const content = readFileSync(join(dir, file), "utf-8");
    for (const line of content.split("\n")) {
      if (line.trim()) lines.push(JSON.parse(line));
    }
  }
  return lines;
}

describe("JsonlLogger", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("log", () => {
    it("writes a single log entry as JSONL", () => {
      const logger = new JsonlLogger(TEST_DIR);
      logger.log("injection", "injected", { count: 3, project: "test" });

      const lines = readLogLines(TEST_DIR);
      expect(lines).toHaveLength(1);
      expect(lines[0].category).toBe("injection");
      expect(lines[0].event).toBe("injected");
      expect(lines[0].data).toEqual({ count: 3, project: "test" });
      expect(lines[0].timestamp).toBeDefined();
    });

    it("writes multiple log entries", () => {
      const logger = new JsonlLogger(TEST_DIR);
      logger.log("detection", "corrective_found", { count: 2 });
      logger.log("generation", "experience_created", { count: 1 });

      const lines = readLogLines(TEST_DIR);
      expect(lines).toHaveLength(2);
      expect(lines[0].category).toBe("detection");
      expect(lines[1].category).toBe("generation");
    });

    it("includes ISO 8601 timestamp", () => {
      const logger = new JsonlLogger(TEST_DIR);
      logger.log("skip", "idempotency_guard", { session_id: "s1" });

      const lines = readLogLines(TEST_DIR);
      const ts = lines[0].timestamp as string;
      // ISO 8601 format check
      expect(() => new Date(ts)).not.toThrow();
      expect(new Date(ts).toISOString()).toBe(ts);
    });
  });

  describe("file naming", () => {
    it("uses date-based filename acm-YYYY-MM-DD.jsonl", () => {
      const logger = new JsonlLogger(TEST_DIR);
      logger.log("injection", "test", {});

      const today = new Date().toISOString().slice(0, 10);
      const expectedFile = `acm-${today}.jsonl`;
      expect(existsSync(join(TEST_DIR, expectedFile))).toBe(true);
    });
  });

  describe("all event categories", () => {
    const categories: LogCategory[] = [
      "injection",
      "detection",
      "generation",
      "retrieval",
      "llm_eval",
      "error",
      "skip",
    ];

    it.each(categories)("accepts category '%s'", (category) => {
      const logger = new JsonlLogger(TEST_DIR);
      logger.log(category, "test_event", { key: "value" });

      const lines = readLogLines(TEST_DIR);
      expect(lines).toHaveLength(1);
      expect(lines[0].category).toBe(category);
    });
  });

  describe("error resilience", () => {
    it("does not throw when log directory does not exist", () => {
      const badDir = join(TEST_DIR, "nonexistent", "deep", "path");
      const logger = new JsonlLogger(badDir);
      // Should not throw — logging failures are best-effort
      expect(() => logger.log("error", "test", {})).not.toThrow();
    });

    it("does not throw when log directory is not writable", () => {
      // Use a path that likely doesn't exist and can't be created
      const logger = new JsonlLogger("/dev/null/impossible");
      expect(() => logger.log("error", "test", {})).not.toThrow();
    });
  });

  describe("directory creation", () => {
    it("creates log directory if it does not exist", () => {
      const subDir = join(TEST_DIR, "sub", "logs");
      const logger = new JsonlLogger(subDir);
      logger.log("injection", "test", {});

      expect(existsSync(subDir)).toBe(true);
      const lines = readLogLines(subDir);
      expect(lines).toHaveLength(1);
    });
  });

  describe("resolveLogDir", () => {
    it("uses CLAUDE_PLUGIN_DATA/logs when env is set", () => {
      const dir = JsonlLogger.resolveLogDir("/mock/plugin/data");
      expect(dir).toBe("/mock/plugin/data/logs");
    });

    it("falls back to ~/.acm/logs when env is not set", () => {
      const dir = JsonlLogger.resolveLogDir(undefined);
      expect(dir).toContain(".acm/logs");
    });
  });
});
