/**
 * SessionSignalStore — SQLite CRUD for session signals
 * SPECIFICATION.md Section 3
 */
import { EVENT_TYPES } from "./types.js";
export class SessionSignalStore {
    db;
    insertStmt;
    getBySessionStmt;
    getBySessionAfterStmt;
    countByTypeStmt;
    countByTypeAfterStmt;
    clearSessionStmt;
    countSpecificTypesStmt;
    hasTestPassStmt;
    hasTestPassAfterStmt;
    hasSignalOfTypeStmt;
    constructor(db) {
        this.db = db;
        this.insertStmt = db.prepare("INSERT INTO session_signals (session_id, event_type, data, timestamp) VALUES (?, ?, ?, ?)");
        this.getBySessionStmt = db.prepare("SELECT id, session_id, event_type, data, timestamp FROM session_signals WHERE session_id = ? ORDER BY id");
        this.getBySessionAfterStmt = db.prepare("SELECT id, session_id, event_type, data, timestamp FROM session_signals WHERE session_id = ? AND timestamp > ? ORDER BY id");
        this.countByTypeStmt = db.prepare("SELECT event_type, COUNT(*) as count FROM session_signals WHERE session_id = ? GROUP BY event_type");
        this.countByTypeAfterStmt = db.prepare("SELECT event_type, COUNT(*) as count FROM session_signals WHERE session_id = ? AND timestamp > ? GROUP BY event_type");
        this.clearSessionStmt = db.prepare("DELETE FROM session_signals WHERE session_id = ?");
        this.countSpecificTypesStmt = db.prepare("SELECT event_type, COUNT(*) as count FROM session_signals WHERE session_id = ? AND event_type IN (?, ?) GROUP BY event_type");
        this.hasTestPassStmt = db.prepare("SELECT 1 FROM session_signals WHERE session_id = ? AND event_type = 'tool_success' AND json_extract(data, '$.test_passed') = 1 LIMIT 1");
        this.hasTestPassAfterStmt = db.prepare("SELECT 1 FROM session_signals WHERE session_id = ? AND event_type = 'tool_success' AND json_extract(data, '$.test_passed') = 1 AND timestamp > ? LIMIT 1");
        this.hasSignalOfTypeStmt = db.prepare("SELECT 1 FROM session_signals WHERE session_id = ? AND event_type = ? LIMIT 1");
    }
    addSignal(sessionId, eventType, data) {
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
    getBySession(sessionId) {
        const rows = this.getBySessionStmt.all(sessionId);
        return rows.map((row) => ({
            id: row.id,
            session_id: row.session_id,
            event_type: row.event_type,
            data: row.data ? this.parseData(row.data) : null,
            timestamp: row.timestamp,
        }));
    }
    getBySessionAfter(sessionId, afterTimestamp) {
        const rows = this.getBySessionAfterStmt.all(sessionId, afterTimestamp);
        return rows.map((row) => ({
            id: row.id,
            session_id: row.session_id,
            event_type: row.event_type,
            data: row.data ? this.parseData(row.data) : null,
            timestamp: row.timestamp,
        }));
    }
    countByType(sessionId) {
        const rows = this.countByTypeStmt.all(sessionId);
        const counts = Object.fromEntries(EVENT_TYPES.map((t) => [t, 0]));
        for (const row of rows) {
            counts[row.event_type] = row.count;
        }
        return counts;
    }
    countByTypeAfter(sessionId, afterTimestamp) {
        const rows = this.countByTypeAfterStmt.all(sessionId, afterTimestamp);
        const counts = Object.fromEntries(EVENT_TYPES.map((t) => [t, 0]));
        for (const row of rows) {
            counts[row.event_type] = row.count;
        }
        return counts;
    }
    countSpecificTypes(sessionId, type1, type2) {
        const rows = this.countSpecificTypesStmt.all(sessionId, type1, type2);
        const counts = { [type1]: 0, [type2]: 0 };
        for (const row of rows) {
            counts[row.event_type] = row.count;
        }
        return counts;
    }
    hasTestPass(sessionId) {
        const row = this.hasTestPassStmt.get(sessionId);
        return row != null;
    }
    hasTestPassAfter(sessionId, afterTimestamp) {
        const row = this.hasTestPassAfterStmt.get(sessionId, afterTimestamp);
        return row != null;
    }
    hasSignalOfType(sessionId, eventType) {
        return this.hasSignalOfTypeStmt.get(sessionId, eventType) !== undefined;
    }
    clearSession(sessionId) {
        const result = this.clearSessionStmt.run(sessionId);
        return result.changes;
    }
    parseData(raw) {
        try {
            return JSON.parse(raw);
        }
        catch {
            return { _raw: raw, _parse_error: true };
        }
    }
}
//# sourceMappingURL=session-store.js.map