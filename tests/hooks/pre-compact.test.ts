/**
 * Tests for PreCompact hook — corrective signal preservation (Issue #90)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { handlePreCompact } from "../../src/hooks/pre-compact.js";
import { initializeDatabase } from "../../src/store/schema.js";
import { SessionSignalStore } from "../../src/signals/session-store.js";
import {
  userLine,
  interruptLine,
  assistantLine,
  setupEnv,
  cleanupEnv,
  writeTranscript,
  makeTmpDir,
} from "./_fixtures.js";

const TMP_DIR = makeTmpDir("pre-compact");

describe("PreCompact hook", () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    cleanupEnv();
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("preserves corrective signals from transcript before compaction", async () => {
    const dbPath = setupEnv(TMP_DIR);
    const transcriptPath = writeTranscript(TMP_DIR, [
      userLine("Implement feature X"),
      assistantLine("Working on it..."),
      interruptLine(),
      userLine("No, that's wrong. Use a different approach please"),
      assistantLine("OK, using a different approach"),
    ]);

    const stdin = JSON.stringify({
      session_id: "pre-compact-s1",
      transcript_path: transcriptPath,
      cwd: TMP_DIR,
    });

    await handlePreCompact(stdin);

    const db = await initializeDatabase(dbPath);
    try {
      const store = new SessionSignalStore(db);
      const signals = store.getBySession("pre-compact-s1");
      const correctives = signals.filter((s) => s.event_type === "corrective_instruction");
      expect(correctives.length).toBeGreaterThan(0);

      const data = correctives[0].data as Record<string, unknown>;
      expect(data.source).toBe("pre_compact");
    } finally {
      db.close();
    }
  });

  it("skips when corrective signals already exist (idempotent)", async () => {
    const dbPath = setupEnv(TMP_DIR);
    const transcriptPath = writeTranscript(TMP_DIR, [
      userLine("Implement feature X"),
      assistantLine("Working on it..."),
      interruptLine(),
      userLine("No, use a different approach"),
      assistantLine("OK"),
    ]);

    const stdin = JSON.stringify({
      session_id: "pre-compact-s2",
      transcript_path: transcriptPath,
      cwd: TMP_DIR,
    });

    await handlePreCompact(stdin);

    const db1 = await initializeDatabase(dbPath);
    let firstCallCount: number;
    try {
      const store = new SessionSignalStore(db1);
      const signals = store.getBySession("pre-compact-s2");
      firstCallCount = signals.filter((s) => s.event_type === "corrective_instruction").length;
      expect(firstCallCount).toBeGreaterThan(0);
    } finally {
      db1.close();
    }

    await handlePreCompact(stdin);

    const db2 = await initializeDatabase(dbPath);
    try {
      const store = new SessionSignalStore(db2);
      const signals = store.getBySession("pre-compact-s2");
      const correctives = signals.filter((s) => s.event_type === "corrective_instruction");
      expect(correctives.length).toBe(firstCallCount);
    } finally {
      db2.close();
    }
  });

  it("skips without transcript_path", async () => {
    setupEnv(TMP_DIR);
    const stdin = JSON.stringify({
      session_id: "pre-compact-s3",
      cwd: TMP_DIR,
    });

    await handlePreCompact(stdin);
  });

  it("skips for single-turn transcripts", async () => {
    const dbPath = setupEnv(TMP_DIR);
    const transcriptPath = writeTranscript(TMP_DIR, [userLine("Hello")]);

    const stdin = JSON.stringify({
      session_id: "pre-compact-s4",
      transcript_path: transcriptPath,
      cwd: TMP_DIR,
    });

    await handlePreCompact(stdin);

    const db = await initializeDatabase(dbPath);
    try {
      const store = new SessionSignalStore(db);
      const signals = store.getBySession("pre-compact-s4");
      expect(signals.length).toBe(0);
    } finally {
      db.close();
    }
  });

  it("continues gracefully when transcript analysis fails", async () => {
    setupEnv(TMP_DIR);
    const transcriptPath = writeTranscript(TMP_DIR, [
      userLine("Do something"),
      assistantLine("Working..."),
      userLine("Fix it"),
      assistantLine("Fixed"),
    ]);

    const stdin = JSON.stringify({
      session_id: "pre-compact-s5",
      transcript_path: transcriptPath,
      cwd: TMP_DIR,
    });

    const classifier = await import("../../src/signals/corrective-classifier.js");
    vi.spyOn(classifier, "classifyCorrections").mockRejectedValueOnce(
      new Error("LLM connection refused")
    );

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await handlePreCompact(stdin);

    expect(spy).toHaveBeenCalledWith(expect.stringContaining("transcript analysis failed"));
    spy.mockRestore();
  });
});
