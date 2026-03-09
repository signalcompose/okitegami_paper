/**
 * SessionSignalStore — SQLite CRUD for session signals
 * SPECIFICATION.md Section 3
 */

import type Database from "better-sqlite3";
import type { EventType, SessionSignal } from "./types.js";
import { EVENT_TYPES } from "./types.js";

interface SignalRow {
  id: number;
  session_id: string;
  event_type: string;
  data: string | null;
  timestamp: string;
}

export class SessionSignalStore {
  private insertStmt: Database.Statement;
  private getBySessionStmt: Database.Statement;
  private countByTypeStmt: Database.Statement;
  private clearSessionStmt: Database.Statement;

  constructor(private db: Database.Database) {
    this.insertStmt = db.prepare(
      "INSERT INTO session_signals (session_id, event_type, data, timestamp) VALUES (?, ?, ?, ?)"
    );
    this.getBySessionStmt = db.prepare(
      "SELECT id, session_id, event_type, data, timestamp FROM session_signals WHERE session_id = ? ORDER BY id"
    );
    this.countByTypeStmt = db.prepare(
      "SELECT event_type, COUNT(*) as count FROM session_signals WHERE session_id = ? GROUP BY event_type"
    );
    this.clearSessionStmt = db.prepare(
      "DELETE FROM session_signals WHERE session_id = ?"
    );
  }

  addSignal(
    sessionId: string,
    eventType: EventType,
    data: Record<string, unknown> | null
  ): SessionSignal {
    const timestamp = new Date().toISOString();
    const dataJson = data ? JSON.stringify(data) : null;

    const result = this.insertStmt.run(sessionId, eventType, dataJson, timestamp);

    return {
      id: Number(result.lastInsertRowid),
      session_id: sessionId,
      event_type: eventType,
      data,
      timestamp,
    };
  }

  getBySession(sessionId: string): SessionSignal[] {
    const rows = this.getBySessionStmt.all(sessionId) as SignalRow[];
    return rows.map((row) => ({
      id: row.id,
      session_id: row.session_id,
      event_type: row.event_type as EventType,
      data: row.data ? (JSON.parse(row.data) as Record<string, unknown>) : null,
      timestamp: row.timestamp,
    }));
  }

  countByType(sessionId: string): Record<EventType, number> {
    const rows = this.countByTypeStmt.all(sessionId) as Array<{
      event_type: string;
      count: number;
    }>;

    const counts = Object.fromEntries(
      EVENT_TYPES.map((t) => [t, 0])
    ) as Record<EventType, number>;

    for (const row of rows) {
      counts[row.event_type as EventType] = row.count;
    }

    return counts;
  }

  clearSession(sessionId: string): number {
    const result = this.clearSessionStmt.run(sessionId);
    return result.changes;
  }
}
