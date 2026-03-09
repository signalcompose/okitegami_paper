import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { initializeDatabase } from "./schema.js";
import { SIGNAL_TYPES } from "./types.js";
import type { ExperienceEntry, AcmConfig } from "./types.js";
import {
  serializeEmbedding,
  deserializeEmbedding,
} from "../retrieval/embedding-serde.js";

export interface EntryWithEmbedding {
  entry: ExperienceEntry;
  embedding: Float32Array;
}

export class ExperienceStore {
  private db: Database.Database;
  private config: AcmConfig;
  private stmtInsert: Database.Statement;
  private stmtGetById: Database.Statement;
  private stmtList: Database.Statement;
  private stmtListByType: Database.Statement;
  private stmtDelete: Database.Statement;
  private stmtUpdateEmbedding: Database.Statement;
  private stmtAllWithEmbedding: Database.Statement;
  private stmtAllWithEmbeddingByType: Database.Statement;

  constructor(config: AcmConfig) {
    this.config = config;
    this.db = initializeDatabase(config.db_path);

    this.stmtInsert = this.db.prepare(
      `INSERT INTO experiences
       (id, type, trigger_text, action_text, outcome_text,
        retrieval_keys, signal_strength, signal_type,
        session_id, timestamp, interrupt_context, embedding)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    this.stmtGetById = this.db.prepare(
      "SELECT * FROM experiences WHERE id = ?"
    );
    this.stmtList = this.db.prepare(
      "SELECT * FROM experiences ORDER BY timestamp DESC LIMIT ?"
    );
    this.stmtListByType = this.db.prepare(
      "SELECT * FROM experiences WHERE type = ? ORDER BY timestamp DESC"
    );
    this.stmtDelete = this.db.prepare(
      "DELETE FROM experiences WHERE id = ?"
    );
    this.stmtUpdateEmbedding = this.db.prepare(
      "UPDATE experiences SET embedding = ? WHERE id = ?"
    );
    this.stmtAllWithEmbedding = this.db.prepare(
      "SELECT * FROM experiences WHERE embedding IS NOT NULL"
    );
    this.stmtAllWithEmbeddingByType = this.db.prepare(
      "SELECT * FROM experiences WHERE embedding IS NOT NULL AND type = ?"
    );
  }

  create(
    data: Omit<ExperienceEntry, "id">
  ): ExperienceEntry | null {
    return this.insertEntry(data, null);
  }

  createWithEmbedding(
    data: Omit<ExperienceEntry, "id">,
    embedding: Float32Array
  ): ExperienceEntry | null {
    return this.insertEntry(data, serializeEmbedding(embedding));
  }

  getById(id: string): ExperienceEntry | null {
    const row = this.stmtGetById.get(id) as
      | Record<string, unknown>
      | undefined;

    if (!row) return null;
    return this.rowToEntry(row);
  }

  list(options?: { limit?: number }): ExperienceEntry[] {
    const rows = this.stmtList.all(
      options?.limit ?? -1
    ) as Record<string, unknown>[];

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

  updateEmbedding(id: string, embedding: Float32Array): boolean {
    const result = this.stmtUpdateEmbedding.run(
      serializeEmbedding(embedding),
      id
    );
    return result.changes > 0;
  }

  getAllWithEmbedding(): EntryWithEmbedding[] {
    let rows: Record<string, unknown>[];

    switch (this.config.mode) {
      case "disabled":
        return [];
      case "success_only":
        rows = this.stmtAllWithEmbeddingByType.all("success") as Record<string, unknown>[];
        break;
      case "failure_only":
        rows = this.stmtAllWithEmbeddingByType.all("failure") as Record<string, unknown>[];
        break;
      case "full":
        rows = this.stmtAllWithEmbedding.all() as Record<string, unknown>[];
        break;
    }

    const results: EntryWithEmbedding[] = [];
    let skippedCount = 0;
    for (const row of rows) {
      try {
        results.push({
          entry: this.rowToEntry(row),
          embedding: deserializeEmbedding(row.embedding as Buffer),
        });
      } catch (err) {
        // Skip corrupt embedding rows rather than failing entire retrieval
        const rowId = (row.id as string) ?? "unknown";
        console.warn(
          `[ACM] Skipping corrupt embedding row id="${rowId}": ${err instanceof Error ? err.message : String(err)}`
        );
        skippedCount++;
      }
    }
    if (skippedCount > 0) {
      console.warn(
        `[ACM] getAllWithEmbedding: skipped ${skippedCount} corrupt row(s)`
      );
    }
    return results;
  }

  delete(id: string): boolean {
    const result = this.stmtDelete.run(id);
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }

  private insertEntry(
    data: Omit<ExperienceEntry, "id">,
    embeddingBlob: Buffer | null
  ): ExperienceEntry | null {
    if (data.signal_strength < 0 || data.signal_strength > 1) {
      throw new Error(
        `signal_strength must be between 0 and 1, got ${data.signal_strength}`
      );
    }
    if (!SIGNAL_TYPES.includes(data.signal_type)) {
      throw new Error(
        `Invalid signal_type "${data.signal_type}". Must be one of: ${SIGNAL_TYPES.join(", ")}`
      );
    }
    if (data.signal_strength < this.config.promotion_threshold) {
      return null;
    }

    const id = randomUUID();
    const entry: ExperienceEntry = { id, ...data };

    this.stmtInsert.run(
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
      embeddingBlob
    );

    return entry;
  }

  private listByType(type: "success" | "failure"): ExperienceEntry[] {
    const rows = this.stmtListByType.all(type) as Record<string, unknown>[];
    return rows.map((row) => this.rowToEntry(row));
  }

  private rowToEntry(row: Record<string, unknown>): ExperienceEntry {
    const id = row.id as string;
    try {
      return {
        id,
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
    } catch (err) {
      throw new Error(
        `Failed to deserialize experience entry id="${id}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
