/**
 * Tests for PreCompact hook — corrective signal preservation (Issue #90)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handlePreCompact } from "../../src/hooks/pre-compact.js";
import { initializeDatabase } from "../../src/store/schema.js";
import { SessionSignalStore } from "../../src/signals/session-store.js";

const TMP_DIR = join(tmpdir(), "acm-test-pre-compact");

/** Create a config file and set env, return db path */
function setupEnv(): string {
  mkdirSync(TMP_DIR, { recursive: true });
  const dbPath = join(TMP_DIR, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const configPath = join(TMP_DIR, `config-${Date.now()}.json`);
  writeFileSync(
    configPath,
    JSON.stringify({
      mode: "full",
      db_path: dbPath,
      promotion_threshold: 0.1,
    })
  );
  process.env.ACM_CONFIG_PATH = configPath;
  return dbPath;
}

function cleanupEnv(): void {
  delete process.env.ACM_CONFIG_PATH;
}

/** Create a transcript JSONL line for a real user message */
function userLine(text: string): string {
  return JSON.stringify({
    type: "user",
    timestamp: new Date().toISOString(),
    uuid: crypto.randomUUID(),
    parentUuid: null,
    permissionMode: "default",
    promptId: crypto.randomUUID(),
    message: { role: "user", content: text },
  });
}

/** Create a transcript JSONL line for an interrupt */
function interruptLine(): string {
  return JSON.stringify({
    type: "user",
    timestamp: new Date().toISOString(),
    uuid: crypto.randomUUID(),
    parentUuid: null,
    message: { role: "user", content: "[Request interrupted by user]" },
  });
}

/** Create a transcript JSONL line for an assistant response */
function assistantLine(text: string): string {
  return JSON.stringify({
    type: "assistant",
    timestamp: new Date().toISOString(),
    uuid: crypto.randomUUID(),
    message: { role: "assistant", content: text },
  });
}

describe("PreCompact hook", () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    cleanupEnv();
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("preserves corrective signals from transcript before compaction", async () => {
    const dbPath = setupEnv();
    const transcriptPath = join(TMP_DIR, "transcript.jsonl");
    writeFileSync(
      transcriptPath,
      [
        userLine("Implement feature X"),
        assistantLine("Working on it..."),
        interruptLine(),
        userLine("No, that's wrong. Use a different approach please"),
        assistantLine("OK, using a different approach"),
      ].join("\n") + "\n"
    );

    const stdin = JSON.stringify({
      session_id: "pre-compact-s1",
      transcript_path: transcriptPath,
      cwd: TMP_DIR,
    });

    await handlePreCompact(stdin);

    // Verify signals were preserved
    const db = await initializeDatabase(dbPath);
    try {
      const store = new SessionSignalStore(db);
      const signals = store.getBySession("pre-compact-s1");
      const correctives = signals.filter((s) => s.event_type === "corrective_instruction");
      expect(correctives.length).toBeGreaterThan(0);

      // Check source marker
      const data = correctives[0].data as Record<string, unknown>;
      expect(data.source).toBe("pre_compact");
    } finally {
      db.close();
    }
  });

  it("skips when corrective signals already exist (idempotent)", async () => {
    const dbPath = setupEnv();
    const transcriptPath = join(TMP_DIR, "transcript.jsonl");
    writeFileSync(
      transcriptPath,
      [
        userLine("Implement feature X"),
        assistantLine("Working on it..."),
        interruptLine(),
        userLine("No, use a different approach"),
        assistantLine("OK"),
      ].join("\n") + "\n"
    );

    const stdin = JSON.stringify({
      session_id: "pre-compact-s2",
      transcript_path: transcriptPath,
      cwd: TMP_DIR,
    });

    // First call: should preserve signals
    await handlePreCompact(stdin);

    // Verify first call stored signals
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

    // Second call: should skip (idempotent)
    await handlePreCompact(stdin);

    // Verify signals were not duplicated
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
    setupEnv();
    const stdin = JSON.stringify({
      session_id: "pre-compact-s3",
      cwd: TMP_DIR,
    });

    // Should not throw
    await handlePreCompact(stdin);
  });

  it("skips for single-turn transcripts", async () => {
    const dbPath = setupEnv();
    const transcriptPath = join(TMP_DIR, "transcript.jsonl");
    writeFileSync(transcriptPath, userLine("Hello") + "\n");

    const stdin = JSON.stringify({
      session_id: "pre-compact-s4",
      transcript_path: transcriptPath,
      cwd: TMP_DIR,
    });

    await handlePreCompact(stdin);

    // Verify no signals were added
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
    setupEnv();
    const transcriptPath = join(TMP_DIR, "bad-transcript.jsonl");
    writeFileSync(transcriptPath, "not valid jsonl content here\n");

    const stdin = JSON.stringify({
      session_id: "pre-compact-s5",
      transcript_path: transcriptPath,
      cwd: TMP_DIR,
    });

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Should not throw
    await handlePreCompact(stdin);
    spy.mockRestore();
  });
});
