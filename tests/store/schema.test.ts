import { describe, it, expect, afterEach } from "vitest";
import { initializeDatabase } from "../../src/store/schema.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync } from "node:fs";
import type Database from "better-sqlite3";

describe("initializeDatabase", () => {
  let db: Database.Database;
  const cleanupPaths: string[] = [];

  afterEach(() => {
    db?.close();
    for (const p of cleanupPaths) {
      try {
        unlinkSync(p);
      } catch {
        /* ignore */
      }
      try {
        unlinkSync(p + "-wal");
      } catch {
        /* ignore */
      }
      try {
        unlinkSync(p + "-shm");
      } catch {
        /* ignore */
      }
    }
    cleanupPaths.length = 0;
  });

  it("creates experiences table with correct columns including project", () => {
    db = initializeDatabase(":memory:");

    const tableInfo = db.prepare("PRAGMA table_info(experiences)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;

    const columnNames = tableInfo.map((c) => c.name);
    expect(columnNames).toContain("id");
    expect(columnNames).toContain("type");
    expect(columnNames).toContain("trigger_text");
    expect(columnNames).toContain("action_text");
    expect(columnNames).toContain("outcome_text");
    expect(columnNames).toContain("retrieval_keys");
    expect(columnNames).toContain("signal_strength");
    expect(columnNames).toContain("signal_type");
    expect(columnNames).toContain("session_id");
    expect(columnNames).toContain("timestamp");
    expect(columnNames).toContain("interrupt_context");
    expect(columnNames).toContain("embedding");
    expect(columnNames).toContain("project");
  });

  it("creates expected indexes including project", () => {
    db = initializeDatabase(":memory:");

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'experiences'")
      .all() as Array<{ name: string }>;

    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain("idx_experiences_type");
    expect(indexNames).toContain("idx_experiences_signal_strength");
    expect(indexNames).toContain("idx_experiences_timestamp");
    expect(indexNames).toContain("idx_experiences_project");
  });

  it("migrates existing DB without project column", async () => {
    const dbPath = join(tmpdir(), `acm-migration-test-${Date.now()}.db`);
    cleanupPaths.push(dbPath);

    // Create a DB with the old schema (no project column)
    const BetterSqlite3 = (await import("better-sqlite3")).default;
    const oldDb = new BetterSqlite3(dbPath);
    oldDb.exec(`
      CREATE TABLE experiences (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        trigger_text TEXT NOT NULL,
        action_text TEXT NOT NULL,
        outcome_text TEXT NOT NULL,
        retrieval_keys TEXT NOT NULL,
        signal_strength REAL NOT NULL,
        signal_type TEXT NOT NULL,
        session_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        interrupt_context TEXT,
        embedding BLOB
      );
      CREATE TABLE session_signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        data TEXT,
        timestamp TEXT NOT NULL
      );
    `);
    // Insert a row without project
    oldDb
      .prepare("INSERT INTO experiences VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        "old-entry-1",
        "success",
        "trigger",
        "action",
        "outcome",
        '["key"]',
        0.8,
        "uninterrupted_completion",
        "sess-old",
        "2026-01-01T00:00:00Z",
        null,
        null
      );
    oldDb.close();

    // Re-open with initializeDatabase which should run migration
    db = initializeDatabase(dbPath);

    // Verify project column now exists
    const tableInfo = db.prepare("PRAGMA table_info(experiences)").all() as Array<{ name: string }>;
    expect(tableInfo.map((c) => c.name)).toContain("project");

    // Verify old data is still accessible with project=NULL
    const row = db.prepare("SELECT project FROM experiences WHERE id = ?").get("old-entry-1") as {
      project: string | null;
    };
    expect(row.project).toBeNull();
  });

  it("is idempotent — calling twice on same DB does not throw", () => {
    const dbPath = join(tmpdir(), `acm-idempotent-test-${Date.now()}.db`);
    cleanupPaths.push(dbPath);

    db = initializeDatabase(dbPath);
    db.close();

    // Second call on same file should not throw
    db = initializeDatabase(dbPath);

    const tableInfo = db.prepare("PRAGMA table_info(experiences)").all() as Array<{ name: string }>;
    expect(tableInfo.map((c) => c.name)).toContain("id");
  });
});
