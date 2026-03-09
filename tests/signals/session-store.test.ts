import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initializeDatabase } from "../../src/store/schema.js";
import { SessionSignalStore } from "../../src/signals/session-store.js";
import type Database from "better-sqlite3";
import type { EventType } from "../../src/signals/types.js";

describe("session_signals schema", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initializeDatabase(":memory:");
  });

  afterEach(() => {
    db?.close();
  });

  it("creates session_signals table with correct columns", () => {
    const tableInfo = db
      .prepare("PRAGMA table_info(session_signals)")
      .all() as Array<{ name: string; type: string; notnull: number }>;

    const columnNames = tableInfo.map((c) => c.name);
    expect(columnNames).toEqual([
      "id",
      "session_id",
      "event_type",
      "data",
      "timestamp",
    ]);
  });

  it("creates session_id index on session_signals", () => {
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'session_signals'"
      )
      .all() as Array<{ name: string }>;

    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain("idx_session_signals_session_id");
  });

  it("coexists with experiences table", () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
      )
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("experiences");
    expect(tableNames).toContain("session_signals");
  });

  it("enforces event_type CHECK constraint", () => {
    expect(() => {
      db.prepare(
        "INSERT INTO session_signals (session_id, event_type, timestamp) VALUES (?, ?, ?)"
      ).run("s1", "invalid_type", new Date().toISOString());
    }).toThrow();
  });
});

describe("SessionSignalStore", () => {
  let db: Database.Database;
  let store: SessionSignalStore;

  beforeEach(() => {
    db = initializeDatabase(":memory:");
    store = new SessionSignalStore(db);
  });

  afterEach(() => {
    db?.close();
  });

  it("addSignal inserts and returns a SessionSignal with id", () => {
    const signal = store.addSignal("session-1", "interrupt", { tool: "Bash" });

    expect(signal.id).toBeGreaterThan(0);
    expect(signal.session_id).toBe("session-1");
    expect(signal.event_type).toBe("interrupt");
    expect(signal.data).toEqual({ tool: "Bash" });
    expect(signal.timestamp).toBeTruthy();
  });

  it("addSignal with null data", () => {
    const signal = store.addSignal("session-1", "stop", null);

    expect(signal.data).toBeNull();
  });

  it("getBySession returns signals for a specific session", () => {
    store.addSignal("s1", "interrupt", null);
    store.addSignal("s1", "tool_success", { tool: "Read" });
    store.addSignal("s2", "stop", null);

    const s1Signals = store.getBySession("s1");
    expect(s1Signals).toHaveLength(2);
    expect(s1Signals[0].event_type).toBe("interrupt");
    expect(s1Signals[1].event_type).toBe("tool_success");

    const s2Signals = store.getBySession("s2");
    expect(s2Signals).toHaveLength(1);
  });

  it("getBySession returns empty array for unknown session", () => {
    const signals = store.getBySession("nonexistent");
    expect(signals).toEqual([]);
  });

  it("countByType returns correct counts per event type", () => {
    store.addSignal("s1", "interrupt", null);
    store.addSignal("s1", "interrupt", null);
    store.addSignal("s1", "corrective_instruction", { pattern: "try again" });
    store.addSignal("s1", "tool_success", null);

    const counts = store.countByType("s1");
    expect(counts.interrupt).toBe(2);
    expect(counts.corrective_instruction).toBe(1);
    expect(counts.tool_success).toBe(1);
    expect(counts.stop).toBe(0);
    expect(counts.rewind).toBe(0);
    expect(counts.post_interrupt_turn).toBe(0);
  });

  it("clearSession removes all signals for a session", () => {
    store.addSignal("s1", "interrupt", null);
    store.addSignal("s1", "stop", null);
    store.addSignal("s2", "stop", null);

    const deleted = store.clearSession("s1");
    expect(deleted).toBe(2);

    expect(store.getBySession("s1")).toEqual([]);
    expect(store.getBySession("s2")).toHaveLength(1);
  });

  it("clearSession returns 0 for unknown session", () => {
    const deleted = store.clearSession("nonexistent");
    expect(deleted).toBe(0);
  });

  it("rejects invalid event types", () => {
    expect(() => {
      store.addSignal("s1", "bogus" as EventType, null);
    }).toThrow();
  });

  describe("countSpecificTypes", () => {
    it("returns counts for specified event types only", () => {
      store.addSignal("s1", "interrupt", null);
      store.addSignal("s1", "interrupt", null);
      store.addSignal("s1", "post_interrupt_turn", { prompt: "fix it" });
      store.addSignal("s1", "tool_success", null);

      const counts = store.countSpecificTypes("s1", "interrupt", "post_interrupt_turn");
      expect(counts.interrupt).toBe(2);
      expect(counts.post_interrupt_turn).toBe(1);
      expect(counts).not.toHaveProperty("tool_success");
    });

    it("returns zeros for types with no signals", () => {
      const counts = store.countSpecificTypes("s1", "interrupt", "post_interrupt_turn");
      expect(counts.interrupt).toBe(0);
      expect(counts.post_interrupt_turn).toBe(0);
    });
  });

  describe("hasTestPass", () => {
    it("returns true when a test_passed signal exists", () => {
      store.addSignal("s1", "tool_success", {
        tool_name: "Bash",
        is_test_runner: true,
        test_passed: true,
      });

      expect(store.hasTestPass("s1")).toBe(true);
    });

    it("returns false when no test_passed signal exists", () => {
      store.addSignal("s1", "tool_success", {
        tool_name: "Bash",
        is_test_runner: true,
        test_passed: false,
      });

      expect(store.hasTestPass("s1")).toBe(false);
    });

    it("returns false for empty session", () => {
      expect(store.hasTestPass("nonexistent")).toBe(false);
    });
  });
});
