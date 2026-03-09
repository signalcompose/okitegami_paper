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
      try { unlinkSync(p); } catch { /* ignore */ }
      try { unlinkSync(p + "-wal"); } catch { /* ignore */ }
      try { unlinkSync(p + "-shm"); } catch { /* ignore */ }
    }
    cleanupPaths.length = 0;
  });

  it("creates experiences table with correct columns", () => {
    db = initializeDatabase(":memory:");

    const tableInfo = db
      .prepare("PRAGMA table_info(experiences)")
      .all() as Array<{ name: string; type: string; notnull: number }>;

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
  });

  it("creates expected indexes", () => {
    db = initializeDatabase(":memory:");

    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'experiences'"
      )
      .all() as Array<{ name: string }>;

    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain("idx_experiences_type");
    expect(indexNames).toContain("idx_experiences_signal_strength");
    expect(indexNames).toContain("idx_experiences_timestamp");
  });

  it("is idempotent — calling twice on same DB does not throw", () => {
    const dbPath = join(tmpdir(), `acm-idempotent-test-${Date.now()}.db`);
    cleanupPaths.push(dbPath);

    db = initializeDatabase(dbPath);
    db.close();

    // Second call on same file should not throw
    db = initializeDatabase(dbPath);

    const tableInfo = db
      .prepare("PRAGMA table_info(experiences)")
      .all() as Array<{ name: string }>;
    expect(tableInfo.map((c) => c.name)).toContain("id");
  });
});
