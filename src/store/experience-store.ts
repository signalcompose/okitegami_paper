import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { initializeDatabase } from "./schema.js";
import type { ExperienceEntry, AcmConfig, SignalType } from "./types.js";

const VALID_SIGNAL_TYPES: SignalType[] = [
  "interrupt_with_dialogue",
  "rewind",
  "corrective_instruction",
  "uninterrupted_completion",
];

export class ExperienceStore {
  private db: Database.Database;
  private config: AcmConfig;

  constructor(config: AcmConfig) {
    this.config = config;
    this.db = initializeDatabase(config.db_path);
  }

  create(
    data: Omit<ExperienceEntry, "id">
  ): ExperienceEntry | null {
    if (data.signal_strength < 0 || data.signal_strength > 1) {
      throw new Error(
        `signal_strength must be between 0 and 1, got ${data.signal_strength}`
      );
    }
    if (!VALID_SIGNAL_TYPES.includes(data.signal_type)) {
      throw new Error(
        `Invalid signal_type "${data.signal_type}". Must be one of: ${VALID_SIGNAL_TYPES.join(", ")}`
      );
    }
    if (data.signal_strength < this.config.promotion_threshold) {
      return null;
    }

    const id = randomUUID();
    const entry: ExperienceEntry = { id, ...data };

    this.db
      .prepare(
        `INSERT INTO experiences
         (id, type, trigger_text, action_text, outcome_text,
          retrieval_keys, signal_strength, signal_type,
          session_id, timestamp, interrupt_context, embedding)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.id,
        entry.type,
        entry.trigger,
        entry.action,
        entry.outcome,
        JSON.stringify(entry.retrieval_keys),
        entry.signal_strength,
        entry.signal_type,
        entry.session_id,
        entry.timestamp,
        entry.interrupt_context
          ? JSON.stringify(entry.interrupt_context)
          : null,
        null // embedding is NULL in Phase 1
      );

    return entry;
  }

  getById(id: string): ExperienceEntry | null {
    const row = this.db
      .prepare("SELECT * FROM experiences WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.rowToEntry(row);
  }

  list(options?: { limit?: number }): ExperienceEntry[] {
    const limit = options?.limit;
    const sql = limit
      ? "SELECT * FROM experiences ORDER BY timestamp DESC LIMIT ?"
      : "SELECT * FROM experiences ORDER BY timestamp DESC";

    const rows = limit
      ? (this.db.prepare(sql).all(limit) as Record<string, unknown>[])
      : (this.db.prepare(sql).all() as Record<string, unknown>[]);

    return rows.map((row) => this.rowToEntry(row));
  }

  listByMode(): ExperienceEntry[] {
    switch (this.config.mode) {
      case "disabled":
        return [];
      case "success_only":
        return this.listByType("success");
      case "failure_only":
        return this.listByType("failure");
      case "full":
        return this.list();
    }
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM experiences WHERE id = ?")
      .run(id);
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }

  private listByType(type: "success" | "failure"): ExperienceEntry[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM experiences WHERE type = ? ORDER BY timestamp DESC"
      )
      .all(type) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntry(row));
  }

  private rowToEntry(row: Record<string, unknown>): ExperienceEntry {
    return {
      id: row.id as string,
      type: row.type as "success" | "failure",
      trigger: row.trigger_text as string,
      action: row.action_text as string,
      outcome: row.outcome_text as string,
      retrieval_keys: JSON.parse(row.retrieval_keys as string) as string[],
      signal_strength: row.signal_strength as number,
      signal_type: row.signal_type as ExperienceEntry["signal_type"],
      session_id: row.session_id as string,
      timestamp: row.timestamp as string,
      interrupt_context: row.interrupt_context
        ? (JSON.parse(row.interrupt_context as string) as ExperienceEntry["interrupt_context"])
        : undefined,
    };
  }
}
