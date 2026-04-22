/**
 * Tests for PreCompact hook — corrective signal preservation (Issue #90)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { handlePreCompact } from "../../src/hooks/pre-compact.js";
import { initializeDatabase } from "../../src/store/schema.js";
import { SessionSignalStore } from "../../src/signals/session-store.js";
import { ExperienceStore } from "../../src/store/experience-store.js";
import { DEFAULT_CONFIG } from "../../src/store/types.js";
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

  it(
    "preserves corrective signals from transcript before compaction",
    { timeout: 15000 },
    async () => {
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
    }
  );

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

  it(
    "generates experience entry with corrective_bodies at PreCompact (#134)",
    { timeout: 20000 },
    async () => {
      const dbPath = setupEnv(TMP_DIR);
      const transcriptPath = writeTranscript(TMP_DIR, [
        userLine("Implement feature X"),
        assistantLine("Working on it..."),
        interruptLine(),
        userLine("No, that's wrong. Use a different approach please"),
        assistantLine("OK, using a different approach"),
        userLine("Still wrong. Use TypeScript generics for the signature."),
        assistantLine("Understood, applying generics."),
        userLine("Actually, rewrite the whole function from scratch."),
        assistantLine("Rewriting."),
      ]);

      const stdin = JSON.stringify({
        session_id: "pre-compact-entry-s1",
        transcript_path: transcriptPath,
        cwd: TMP_DIR,
      });

      await handlePreCompact(stdin);

      const db = await initializeDatabase(dbPath);
      try {
        const expStore = new ExperienceStore(db, DEFAULT_CONFIG);
        const entries = expStore.list().filter((e) => e.session_id === "pre-compact-entry-s1");
        expect(entries.length).toBeGreaterThan(0);
        const failure = entries.find((e) => e.type === "failure");
        expect(failure).toBeDefined();
        expect(failure!.corrective_bodies).toBeDefined();
        expect(failure!.corrective_bodies!.length).toBeGreaterThan(0);
        expect(expStore.getLastEvaluatedAt("pre-compact-entry-s1")).toBeTruthy();
      } finally {
        db.close();
      }
    }
  );

  it(
    "advances segment boundary so subsequent PreCompact does not duplicate entries (#134)",
    { timeout: 20000 },
    async () => {
      const dbPath = setupEnv(TMP_DIR);
      const transcriptPath = writeTranscript(TMP_DIR, [
        userLine("Do X"),
        assistantLine("ok"),
        interruptLine(),
        userLine("No that's wrong, do Y instead"),
        assistantLine("ok Y"),
        userLine("Still wrong, do Z"),
        assistantLine("ok Z"),
      ]);

      const stdin = JSON.stringify({
        session_id: "pre-compact-entry-s2",
        transcript_path: transcriptPath,
        cwd: TMP_DIR,
      });

      await handlePreCompact(stdin);
      await handlePreCompact(stdin);

      const db = await initializeDatabase(dbPath);
      try {
        const expStore = new ExperienceStore(db, DEFAULT_CONFIG);
        const entries = expStore.list().filter((e) => e.session_id === "pre-compact-entry-s2");
        const failures = entries.filter((e) => e.type === "failure");
        expect(failures.length).toBe(1);
      } finally {
        db.close();
      }
    }
  );

  it(
    "Phase 2 runs independently when Phase 1 is skipped due to pre-existing signals (#134)",
    { timeout: 15000 },
    async () => {
      const dbPath = setupEnv(TMP_DIR);
      const db0 = await initializeDatabase(dbPath);
      try {
        const store = new SessionSignalStore(db0);
        for (let i = 0; i < 3; i++) {
          store.addSignal("pre-compact-phase2-only", "corrective_instruction", {
            prompt: `preseeded corrective ${i}`,
            reason: "test",
            confidence: 0.9,
            method: "llm",
            source: "pre_compact",
          });
        }
      } finally {
        db0.close();
      }

      const transcriptPath = writeTranscript(TMP_DIR, [
        userLine("Stub"),
        assistantLine("ok"),
        userLine("Stop"),
      ]);
      const stdin = JSON.stringify({
        session_id: "pre-compact-phase2-only",
        transcript_path: transcriptPath,
        cwd: TMP_DIR,
      });

      await handlePreCompact(stdin);

      const db = await initializeDatabase(dbPath);
      try {
        const expStore = new ExperienceStore(db, DEFAULT_CONFIG);
        const entries = expStore.list().filter((e) => e.session_id === "pre-compact-phase2-only");
        const failure = entries.find((e) => e.type === "failure");
        expect(failure).toBeDefined();
        expect(failure!.corrective_bodies?.length ?? 0).toBeGreaterThan(0);
        expect(expStore.getLastEvaluatedAt("pre-compact-phase2-only")).toBeTruthy();
      } finally {
        db.close();
      }
    }
  );

  it(
    "does not advance boundary when every entry fails to persist (#134)",
    { timeout: 15000 },
    async () => {
      const dbPath = setupEnv(TMP_DIR);
      const db0 = await initializeDatabase(dbPath);
      try {
        const store = new SessionSignalStore(db0);
        for (let i = 0; i < 3; i++) {
          store.addSignal("pre-compact-persist-fail", "corrective_instruction", {
            prompt: `fail-test corrective ${i}`,
            reason: "test",
            confidence: 0.9,
            method: "llm",
            source: "pre_compact",
          });
        }
      } finally {
        db0.close();
      }

      const storeMod = await import("../../src/store/experience-store.js");
      const createSpy = vi
        .spyOn(storeMod.ExperienceStore.prototype, "createWithEmbedding")
        .mockImplementation(() => {
          throw new Error("simulated persist failure");
        });
      const createPlainSpy = vi
        .spyOn(storeMod.ExperienceStore.prototype, "create")
        .mockImplementation(() => {
          throw new Error("simulated persist failure");
        });

      const transcriptPath = writeTranscript(TMP_DIR, [
        userLine("Stub"),
        assistantLine("ok"),
        userLine("Stop"),
      ]);
      const stdin = JSON.stringify({
        session_id: "pre-compact-persist-fail",
        transcript_path: transcriptPath,
        cwd: TMP_DIR,
      });

      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await handlePreCompact(stdin);
      errSpy.mockRestore();
      createSpy.mockRestore();
      createPlainSpy.mockRestore();

      const db = await initializeDatabase(dbPath);
      try {
        const expStore = new ExperienceStore(db, DEFAULT_CONFIG);
        expect(expStore.getLastEvaluatedAt("pre-compact-persist-fail")).toBeNull();
      } finally {
        db.close();
      }
    }
  );

  it(
    "falls back to embedding-less persist when embedder throws mid-loop (#134)",
    { timeout: 20000 },
    async () => {
      const dbPath = setupEnv(TMP_DIR);
      const db0 = await initializeDatabase(dbPath);
      try {
        const store = new SessionSignalStore(db0);
        for (let i = 0; i < 3; i++) {
          store.addSignal("pre-compact-embed-fail", "corrective_instruction", {
            prompt: `corrective body ${i}`,
            reason: "test",
            confidence: 0.9,
            method: "llm",
            source: "pre_compact",
          });
        }
      } finally {
        db0.close();
      }

      const embedderMod = await import("../../src/retrieval/embedder.js");
      const embedSpy = vi
        .spyOn(embedderMod.Embedder.prototype, "embed")
        .mockRejectedValue(new Error("simulated embed failure"));

      const transcriptPath = writeTranscript(TMP_DIR, [userLine("x"), assistantLine("ok")]);
      const stdin = JSON.stringify({
        session_id: "pre-compact-embed-fail",
        transcript_path: transcriptPath,
        cwd: TMP_DIR,
      });

      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await handlePreCompact(stdin);
      errSpy.mockRestore();
      embedSpy.mockRestore();

      const db = await initializeDatabase(dbPath);
      try {
        const expStore = new ExperienceStore(db, DEFAULT_CONFIG);
        const entries = expStore.list().filter((e) => e.session_id === "pre-compact-embed-fail");
        // embed failed on first entry → embedderReady toggled off → remaining
        // entries persist without embedding, so boundary advances.
        expect(entries.length).toBeGreaterThan(0);
        expect(expStore.getLastEvaluatedAt("pre-compact-embed-fail")).toBeTruthy();
      } finally {
        db.close();
      }
    }
  );

  it(
    "handles recordEvaluation throwing without crashing the hook (#134)",
    { timeout: 15000 },
    async () => {
      const dbPath = setupEnv(TMP_DIR);
      const db0 = await initializeDatabase(dbPath);
      try {
        const store = new SessionSignalStore(db0);
        for (let i = 0; i < 3; i++) {
          store.addSignal("pre-compact-record-fail", "corrective_instruction", {
            prompt: `corrective body ${i}`,
            reason: "test",
            confidence: 0.9,
            method: "llm",
            source: "pre_compact",
          });
        }
      } finally {
        db0.close();
      }

      const storeMod = await import("../../src/store/experience-store.js");
      const recordSpy = vi
        .spyOn(storeMod.ExperienceStore.prototype, "recordEvaluation")
        .mockImplementation(() => {
          throw new Error("simulated recordEvaluation failure");
        });

      const transcriptPath = writeTranscript(TMP_DIR, [userLine("x"), assistantLine("ok")]);
      const stdin = JSON.stringify({
        session_id: "pre-compact-record-fail",
        transcript_path: transcriptPath,
        cwd: TMP_DIR,
      });

      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      // Should not throw — the hook catches the recordEvaluation error and logs it
      await expect(handlePreCompact(stdin)).resolves.toBeUndefined();
      errSpy.mockRestore();
      recordSpy.mockRestore();

      // Entries were persisted (spy only mocked recordEvaluation)
      const db = await initializeDatabase(dbPath);
      try {
        const expStore = new ExperienceStore(db, DEFAULT_CONFIG);
        const entries = expStore.list().filter((e) => e.session_id === "pre-compact-record-fail");
        expect(entries.length).toBeGreaterThan(0);
      } finally {
        db.close();
      }
    }
  );

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

    expect(spy).toHaveBeenCalledWith(expect.stringContaining("transcript classification failed"));
    spy.mockRestore();
  });
});
