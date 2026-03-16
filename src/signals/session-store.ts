/**
 * SessionSignalStore — SQLite CRUD for session signals
 * SPECIFICATION.md Section 3
 */

import type { AdaptedDatabase, Statement } from "../store/sqlite-adapter.js";
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
  private insertStmt: Statement;
  private getBySessionStmt: Statement;
  private countByTypeStmt: Statement;
  private clearSessionStmt: Statement;
  private countSpecificTypesStmt: Statement;
  private hasTestPassStmt: Statement;

  constructor(private db: AdaptedDatabase) {
    this.insertStmt = db.prepare(
      "INSERT INTO session_signals (session_id, event_type, data, timestamp) VALUES (?, ?, ?, ?)"
    );
    this.getBySessionStmt = db.prepare(
      "SELECT id, session_id, event_type, data, timestamp FROM session_signals WHERE session_id = ? ORDER BY id"
    );
    this.countByTypeStmt = db.prepare(
      "SELECT event_type, COUNT(*) as count FROM session_signals WHERE session_id = ? GROUP BY event_type"
    );
    this.clearSessionStmt = db.prepare("DELETE FROM session_signals WHERE session_id = ?");
    this.countSpecificTypesStmt = db.prepare(
      "SELECT event_type, COUNT(*) as count FROM session_signals WHERE session_id = ? AND event_type IN (?, ?) GROUP BY event_type"
    );
    this.hasTestPassStmt = db.prepare(
      "SELECT 1 FROM session_signals WHERE session_id = ? AND event_type = 'tool_success' AND json_extract(data, '$.test_passed') = 1 LIMIT 1"
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
    const rows = this.getBySessionStmt.all<SignalRow>(sessionId);
    return rows.map((row) => ({
      id: row.id,
      session_id: row.session_id,
      event_type: row.event_type as EventType,
      data: row.data ? this.parseData(row.data) : null,
      timestamp: row.timestamp,
    }));
  }

  countByType(sessionId: string): Record<EventType, number> {
    const rows = this.countByTypeStmt.all(sessionId) as Array<{
      event_type: string;
      count: number;
    }>;

    const counts = Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as Record<EventType, number>;

    for (const row of rows) {
      counts[row.event_type as EventType] = row.count;
    }

    return counts;
  }

  countSpecificTypes(
    sessionId: string,
    type1: EventType,
    type2: EventType
  ): Record<string, number> {
    const rows = this.countSpecificTypesStmt.all(sessionId, type1, type2) as Array<{
      event_type: string;
      count: number;
    }>;
    const counts: Record<string, number> = { [type1]: 0, [type2]: 0 };
    for (const row of rows) {
      counts[row.event_type] = row.count;
    }
    return counts;
  }

  hasTestPass(sessionId: string): boolean {
    const row = this.hasTestPassStmt.get(sessionId);
    return row != null;
  }

  clearSession(sessionId: string): number {
    const result = this.clearSessionStmt.run(sessionId);
    return result.changes;
  }

  private parseData(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { _raw: raw, _parse_error: true };
    }
  }
}
