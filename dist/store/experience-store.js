import { randomUUID } from "node:crypto";
import { initializeDatabase } from "./schema.js";
import { SIGNAL_TYPES } from "./types.js";
import { serializeEmbedding, deserializeEmbedding } from "../retrieval/embedding-serde.js";
export class ExperienceStore {
    db;
    config;
    stmtInsert;
    stmtGetById;
    stmtList;
    stmtListByType;
    stmtDelete;
    stmtUpdateEmbedding;
    stmtAllWithEmbedding;
    stmtAllWithEmbeddingByType;
    stmtOutcomesBySession;
    stmtCrossProjectReport;
    stmtSignalCountsBySession;
    stmtHasTestPassBySession;
    constructor(config) {
        this.config = config;
        this.db = initializeDatabase(config.db_path);
        this.stmtInsert = this.db.prepare(`INSERT INTO experiences
       (id, type, trigger_text, action_text, outcome_text,
        retrieval_keys, signal_strength, signal_type,
        session_id, timestamp, interrupt_context, embedding, project)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        this.stmtGetById = this.db.prepare("SELECT * FROM experiences WHERE id = ?");
        this.stmtList = this.db.prepare("SELECT * FROM experiences ORDER BY timestamp DESC LIMIT ?");
        this.stmtListByType = this.db.prepare("SELECT * FROM experiences WHERE type = ? ORDER BY timestamp DESC");
        this.stmtDelete = this.db.prepare("DELETE FROM experiences WHERE id = ?");
        this.stmtUpdateEmbedding = this.db.prepare("UPDATE experiences SET embedding = ? WHERE id = ?");
        this.stmtAllWithEmbedding = this.db.prepare("SELECT * FROM experiences WHERE embedding IS NOT NULL");
        this.stmtAllWithEmbeddingByType = this.db.prepare("SELECT * FROM experiences WHERE embedding IS NOT NULL AND type = ?");
        this.stmtOutcomesBySession = this.db.prepare("SELECT * FROM experiences WHERE session_id = ?");
        this.stmtCrossProjectReport = this.db.prepare(`
      SELECT project, COUNT(*) as total_entries,
        SUM(CASE WHEN type='success' THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN type='failure' THEN 1 ELSE 0 END) as failure_count,
        AVG(signal_strength) as avg_signal_strength,
        MIN(timestamp) as first_entry, MAX(timestamp) as last_entry
      FROM experiences WHERE project IS NOT NULL AND project != ''
      GROUP BY project ORDER BY last_entry DESC
    `);
        this.stmtSignalCountsBySession = this.db.prepare(`SELECT event_type, COUNT(*) as count FROM session_signals
       WHERE session_id = ? AND event_type != 'injection'
       GROUP BY event_type`);
        this.stmtHasTestPassBySession = this.db.prepare(`SELECT 1 FROM session_signals
       WHERE session_id = ? AND event_type = 'tool_success'
       AND json_extract(data, '$.test_passed') = 1 LIMIT 1`);
    }
    getDb() {
        return this.db;
    }
    create(data) {
        return this.insertEntry(data, null);
    }
    createWithEmbedding(data, embedding) {
        return this.insertEntry(data, serializeEmbedding(embedding));
    }
    getById(id) {
        const row = this.stmtGetById.get(id);
        if (!row)
            return null;
        return this.rowToEntry(row);
    }
    list(options) {
        const rows = this.stmtList.all(options?.limit ?? -1);
        return rows.map((row) => this.rowToEntry(row));
    }
    listByMode() {
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
    updateEmbedding(id, embedding) {
        const result = this.stmtUpdateEmbedding.run(serializeEmbedding(embedding), id);
        return result.changes > 0;
    }
    getAllWithEmbedding() {
        let rows;
        switch (this.config.mode) {
            case "disabled":
                return [];
            case "success_only":
                rows = this.stmtAllWithEmbeddingByType.all("success");
                break;
            case "failure_only":
                rows = this.stmtAllWithEmbeddingByType.all("failure");
                break;
            case "full":
                rows = this.stmtAllWithEmbedding.all();
                break;
        }
        const results = [];
        let skippedCount = 0;
        for (const row of rows) {
            try {
                results.push({
                    entry: this.rowToEntry(row),
                    embedding: deserializeEmbedding(row.embedding),
                });
            }
            catch (err) {
                // Skip corrupt embedding rows rather than failing entire retrieval
                const rowId = row.id ?? "unknown";
                console.warn(`[ACM] Skipping corrupt embedding row id="${rowId}": ${err instanceof Error ? err.message : String(err)}`);
                skippedCount++;
            }
        }
        if (skippedCount > 0) {
            console.warn(`[ACM] getAllWithEmbedding: skipped ${skippedCount} corrupt row(s)`);
        }
        return results;
    }
    delete(id) {
        const result = this.stmtDelete.run(id);
        return result.changes > 0;
    }
    close() {
        this.db.close();
    }
    insertEntry(data, embeddingBlob) {
        if (data.signal_strength < 0 || data.signal_strength > 1) {
            throw new Error(`signal_strength must be between 0 and 1, got ${data.signal_strength}`);
        }
        if (!SIGNAL_TYPES.includes(data.signal_type)) {
            throw new Error(`Invalid signal_type "${data.signal_type}". Must be one of: ${SIGNAL_TYPES.join(", ")}`);
        }
        if (data.signal_strength < this.config.promotion_threshold) {
            return null;
        }
        const id = randomUUID();
        const entry = { id, ...data };
        this.stmtInsert.run(entry.id, entry.type, entry.trigger, entry.action, entry.outcome, JSON.stringify(entry.retrieval_keys), entry.signal_strength, entry.signal_type, entry.session_id, entry.timestamp, entry.interrupt_context ? JSON.stringify(entry.interrupt_context) : null, embeddingBlob, entry.project ?? null);
        return entry;
    }
    listByType(type) {
        const rows = this.stmtListByType.all(type);
        return rows.map((row) => this.rowToEntry(row));
    }
    getCrossProjectReport() {
        return this.stmtCrossProjectReport.all();
    }
    getInjectionEpisodes(project, limit) {
        // Dynamic SQL: project/limit filters are optional, so prepare() is called per invocation.
        // This is acceptable — acm_report is a user-invoked tool, not a hot path.
        let injectionQuery = `
      SELECT session_id, data, timestamp FROM session_signals
      WHERE event_type = 'injection'
    `;
        const params = [];
        if (project) {
            injectionQuery += ` AND json_extract(data, '$.project') = ?`;
            params.push(project);
        }
        injectionQuery += ` ORDER BY timestamp DESC`;
        if (limit !== undefined) {
            injectionQuery += ` LIMIT ?`;
            params.push(limit);
        }
        const injectionRows = this.db.prepare(injectionQuery).all(...params);
        const episodes = [];
        for (const row of injectionRows) {
            if (!row.data)
                continue;
            const injectionData = JSON.parse(row.data);
            // Get injected experience entries
            const injectedExperiences = [];
            for (const id of injectionData.injected_ids ?? []) {
                const entry = this.getById(id);
                if (entry)
                    injectedExperiences.push(entry);
            }
            // Get session signals summary
            const signalSummary = this.getSessionSignalSummary(row.session_id);
            // Get outcome experiences (generated in same session)
            const outcomeRows = this.stmtOutcomesBySession.all(row.session_id);
            const outcomeExperiences = outcomeRows.map((r) => this.rowToEntry(r));
            episodes.push({
                session_id: row.session_id,
                project: injectionData.project ?? project ?? "",
                timestamp: row.timestamp,
                injected_experiences: injectedExperiences,
                session_signals: signalSummary,
                outcome_experiences: outcomeExperiences,
            });
        }
        return episodes;
    }
    getSessionSignalSummary(sessionId) {
        const rows = this.stmtSignalCountsBySession.all(sessionId);
        const counts = {};
        for (const row of rows) {
            counts[row.event_type] = row.count;
        }
        const hasTestPass = this.stmtHasTestPassBySession.get(sessionId) != null;
        return {
            interrupt_count: counts["interrupt"] ?? 0,
            corrective_count: counts["corrective_instruction"] ?? 0,
            tool_success_count: counts["tool_success"] ?? 0,
            had_test_pass: hasTestPass,
            was_stopped_normally: (counts["stop"] ?? 0) > 0,
        };
    }
    rowToEntry(row) {
        const id = row.id;
        try {
            const entry = {
                id,
                type: row.type,
                trigger: row.trigger_text,
                action: row.action_text,
                outcome: row.outcome_text,
                retrieval_keys: JSON.parse(row.retrieval_keys),
                signal_strength: row.signal_strength,
                signal_type: row.signal_type,
                session_id: row.session_id,
                timestamp: row.timestamp,
                interrupt_context: row.interrupt_context
                    ? JSON.parse(row.interrupt_context)
                    : undefined,
            };
            if (row.project) {
                entry.project = row.project;
            }
            return entry;
        }
        catch (err) {
            throw new Error(`Failed to deserialize experience entry id="${id}": ${err instanceof Error ? err.message : String(err)}`, { cause: err });
        }
    }
}
//# sourceMappingURL=experience-store.js.map