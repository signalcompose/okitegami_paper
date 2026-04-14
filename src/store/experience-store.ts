import { randomUUID } from "node:crypto";
import type { AdaptedDatabase, Statement } from "./sqlite-adapter.js";
import { SIGNAL_TYPES } from "./types.js";
import type {
  ExperienceEntry,
  ExperienceType,
  AcmConfig,
  ProjectReportRow,
  InjectionEpisode,
  SessionSignalSummary,
  RecurrenceRateRow,
  TemporalTrendRow,
  InjectionOutcomeRow,
  CrossProjectTransferRow,
  MeasurementReport,
} from "./types.js";
import { serializeEmbedding, deserializeEmbedding } from "../retrieval/embedding-serde.js";

export interface EntryWithEmbedding {
  entry: ExperienceEntry;
  embedding: Float32Array;
}

export class ExperienceStore {
  private db: AdaptedDatabase;
  private config: AcmConfig;
  private stmtInsert: Statement;
  private stmtGetById: Statement;
  private stmtList: Statement;
  private stmtListByType: Statement;
  private stmtDelete: Statement;
  private stmtUpdateEmbedding: Statement;
  private stmtAllWithEmbedding: Statement;
  private stmtAllWithEmbeddingByType: Statement;
  private stmtOutcomesBySession: Statement;
  private stmtExistsForSession: Statement;
  private stmtCrossProjectReport: Statement;
  private stmtSignalSummaryBySession: Statement;
  private stmtUpdateRetrievalTracking: Statement;
  private stmtAdjustFeedbackScore: Statement;
  private stmtSetPinned: Statement;
  private stmtArchive: Statement;
  private stmtCountActiveByProject: Statement;
  private stmtGetEvictionCandidates: Statement;
  private stmtGetActiveWithEmbeddingByProject: Statement;

  constructor(db: AdaptedDatabase, config: AcmConfig) {
    this.config = config;
    this.db = db;

    this.stmtInsert = this.db.prepare(
      `INSERT INTO experiences
       (id, type, trigger_text, action_text, outcome_text,
        retrieval_keys, signal_strength, signal_type,
        session_id, timestamp, interrupt_context, embedding, project)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    this.stmtGetById = this.db.prepare("SELECT * FROM experiences WHERE id = ?");
    this.stmtList = this.db.prepare("SELECT * FROM experiences ORDER BY timestamp DESC LIMIT ?");
    this.stmtListByType = this.db.prepare(
      "SELECT * FROM experiences WHERE type = ? ORDER BY timestamp DESC"
    );
    this.stmtDelete = this.db.prepare("DELETE FROM experiences WHERE id = ?");
    this.stmtUpdateEmbedding = this.db.prepare("UPDATE experiences SET embedding = ? WHERE id = ?");
    this.stmtAllWithEmbedding = this.db.prepare(
      "SELECT * FROM experiences WHERE embedding IS NOT NULL AND archived_at IS NULL"
    );
    this.stmtAllWithEmbeddingByType = this.db.prepare(
      "SELECT * FROM experiences WHERE embedding IS NOT NULL AND archived_at IS NULL AND type = ?"
    );
    this.stmtOutcomesBySession = this.db.prepare("SELECT * FROM experiences WHERE session_id = ?");
    this.stmtExistsForSession = this.db.prepare(
      "SELECT 1 FROM experiences WHERE session_id = ? LIMIT 1"
    );
    this.stmtCrossProjectReport = this.db.prepare(`
      SELECT project, COUNT(*) as total_entries,
        SUM(CASE WHEN type='success' THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN type='failure' THEN 1 ELSE 0 END) as failure_count,
        AVG(signal_strength) as avg_signal_strength,
        MIN(timestamp) as first_entry, MAX(timestamp) as last_entry
      FROM experiences WHERE project IS NOT NULL AND project != ''
      GROUP BY project ORDER BY last_entry DESC
    `);
    this.stmtSignalSummaryBySession = this.db.prepare(
      `SELECT event_type, COUNT(*) as count,
        MAX(CASE WHEN event_type = 'tool_success'
                  AND json_extract(data, '$.test_passed') = 1 THEN 1 ELSE 0 END) as has_test_pass
       FROM session_signals
       WHERE session_id = ? AND event_type != 'injection'
       GROUP BY event_type`
    );
    this.stmtUpdateRetrievalTracking = this.db.prepare(
      `UPDATE experiences SET retrieval_count = retrieval_count + 1,
       last_retrieved_at = ? WHERE id = ?`
    );
    this.stmtAdjustFeedbackScore = this.db.prepare(
      "UPDATE experiences SET feedback_score = feedback_score + ? WHERE id = ?"
    );
    this.stmtSetPinned = this.db.prepare("UPDATE experiences SET pinned = ? WHERE id = ?");
    this.stmtArchive = this.db.prepare("UPDATE experiences SET archived_at = ? WHERE id = ?");
    this.stmtCountActiveByProject = this.db.prepare(
      "SELECT COUNT(*) as count FROM experiences WHERE project = ? AND archived_at IS NULL"
    );
    this.stmtGetEvictionCandidates = this.db.prepare(
      `SELECT * FROM experiences
       WHERE project = ? AND archived_at IS NULL
         AND pinned = 0 AND feedback_score < ? AND type != 'insight'
       ORDER BY signal_strength ASC, timestamp ASC
       LIMIT ?`
    );
    this.stmtGetActiveWithEmbeddingByProject = this.db.prepare(
      `SELECT * FROM experiences
       WHERE project = ? AND archived_at IS NULL AND embedding IS NOT NULL`
    );
  }

  getDb(): AdaptedDatabase {
    return this.db;
  }

  create(data: Omit<ExperienceEntry, "id">): ExperienceEntry | null {
    return this.insertEntry(data, null);
  }

  createWithEmbedding(
    data: Omit<ExperienceEntry, "id">,
    embedding: Float32Array
  ): ExperienceEntry | null {
    return this.insertEntry(data, serializeEmbedding(embedding));
  }

  getById(id: string): ExperienceEntry | null {
    const row = this.stmtGetById.get(id) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.rowToEntry(row);
  }

  hasEntriesForSession(sessionId: string): boolean {
    return this.stmtExistsForSession.get(sessionId) !== undefined;
  }

  list(options?: { limit?: number }): ExperienceEntry[] {
    const rows = this.stmtList.all(options?.limit ?? -1) as Record<string, unknown>[];

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
    const result = this.stmtUpdateEmbedding.run(serializeEmbedding(embedding), id);
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
          embedding: deserializeEmbedding(row.embedding as Uint8Array),
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
      console.warn(`[ACM] getAllWithEmbedding: skipped ${skippedCount} corrupt row(s)`);
    }
    return results;
  }

  delete(id: string): boolean {
    const result = this.stmtDelete.run(id);
    return result.changes > 0;
  }

  getRecurrenceRate(project?: string): RecurrenceRateRow[] {
    let sql = `
      SELECT jk.value AS key,
             COUNT(DISTINCT e.id) AS occurrence_count,
             MIN(e.timestamp) AS first_seen,
             MAX(e.timestamp) AS last_seen
      FROM experiences e, json_each(e.retrieval_keys) jk
      WHERE e.type = 'failure'
    `;
    const params: unknown[] = [];
    if (project) {
      sql += ` AND e.project = ?`;
      params.push(project);
    }
    sql += ` GROUP BY jk.value HAVING COUNT(DISTINCT e.id) > 1 ORDER BY occurrence_count DESC`;

    return this.db.prepare(sql).all(...params) as RecurrenceRateRow[];
  }

  getTemporalTrend(project?: string): TemporalTrendRow[] {
    let sql = `
      SELECT ss.session_id,
             SUM(CASE WHEN ss.event_type = 'corrective_instruction' THEN 1 ELSE 0 END) AS corrective_count,
             SUM(CASE WHEN ss.event_type = 'tool_success' THEN 1 ELSE 0 END) AS tool_success_count,
             CAST(SUM(CASE WHEN ss.event_type = 'corrective_instruction' THEN 1 ELSE 0 END) AS REAL)
               / SUM(CASE WHEN ss.event_type = 'tool_success' THEN 1 ELSE 0 END) AS corrective_rate,
             MIN(ss.timestamp) AS timestamp
      FROM session_signals ss
    `;
    const params: unknown[] = [];
    if (project) {
      // Use DISTINCT subquery to avoid N-duplication when multiple experience entries exist per session
      sql += ` JOIN (SELECT DISTINCT session_id FROM experiences WHERE project = ?) ep ON ep.session_id = ss.session_id`;
      params.push(project);
    }
    sql += `
      WHERE ss.event_type IN ('corrective_instruction', 'tool_success')
      GROUP BY ss.session_id
      HAVING SUM(CASE WHEN ss.event_type = 'tool_success' THEN 1 ELSE 0 END) > 0
      ORDER BY timestamp ASC
    `;

    return this.db.prepare(sql).all(...params) as TemporalTrendRow[];
  }

  getInjectionOutcomeCorrelation(project?: string): InjectionOutcomeRow[] {
    let sql = `
      SELECT inj.session_id,
             COALESCE(json_array_length(json_extract(inj.data, '$.injected_ids')), 0) AS injected_count,
             COALESCE(cor.corrective_count, 0) AS corrective_count,
             inj.timestamp
      FROM session_signals inj
      LEFT JOIN (
        SELECT session_id, COUNT(*) AS corrective_count
        FROM session_signals
        WHERE event_type = 'corrective_instruction'
        GROUP BY session_id
      ) cor ON cor.session_id = inj.session_id
      WHERE inj.event_type = 'injection'
    `;
    const params: unknown[] = [];
    if (project) {
      sql += ` AND json_extract(inj.data, '$.project') = ?`;
      params.push(project);
    }
    sql += ` ORDER BY inj.timestamp DESC`;

    return this.db.prepare(sql).all(...params) as InjectionOutcomeRow[];
  }

  getCrossProjectTransfer(): CrossProjectTransferRow[] {
    const sql = `
      SELECT src.project AS source_project,
             json_extract(inj.data, '$.project') AS target_project,
             COUNT(*) AS transfer_count
      FROM session_signals inj
      CROSS JOIN json_each(json_extract(inj.data, '$.injected_ids')) jid
      JOIN experiences src ON src.id = jid.value
      WHERE inj.event_type = 'injection'
        AND src.project IS NOT NULL
        AND json_extract(inj.data, '$.project') IS NOT NULL
        AND src.project != json_extract(inj.data, '$.project')
      GROUP BY src.project, json_extract(inj.data, '$.project')
      ORDER BY transfer_count DESC
    `;

    return this.db.prepare(sql).all() as CrossProjectTransferRow[];
  }

  getMeasurementReport(project?: string): MeasurementReport {
    return {
      recurrence_rate: this.getRecurrenceRate(project),
      temporal_trend: this.getTemporalTrend(project),
      injection_outcome_correlation: this.getInjectionOutcomeCorrelation(project),
      cross_project_transfer: this.getCrossProjectTransfer(),
    };
  }

  // --- GC / recency tracking methods (Issue #91) ---

  /** Update retrieval tracking: increment count and set last_retrieved_at */
  updateRetrievalTracking(id: string): void {
    this.stmtUpdateRetrievalTracking.run(new Date().toISOString(), id);
  }

  adjustFeedbackScore(id: string, delta: number): void {
    this.stmtAdjustFeedbackScore.run(delta, id);
  }

  setPinned(id: string, pinned: boolean): boolean {
    const result = this.stmtSetPinned.run(pinned ? 1 : 0, id);
    return result.changes > 0;
  }

  archive(id: string): boolean {
    const result = this.stmtArchive.run(new Date().toISOString(), id);
    return result.changes > 0;
  }

  countActiveByProject(project: string): number {
    const row = this.stmtCountActiveByProject.get(project) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  /** Get eviction candidates: lowest-scored active entries that are not protected */
  getEvictionCandidates(
    project: string,
    limit: number,
    protectedFeedbackThreshold: number = 3
  ): ExperienceEntry[] {
    const rows = this.stmtGetEvictionCandidates.all(
      project,
      protectedFeedbackThreshold,
      limit
    ) as Record<string, unknown>[];
    return rows.map((row) => this.rowToEntry(row));
  }

  getActiveWithEmbeddingByProject(project: string): EntryWithEmbedding[] {
    const rows = this.stmtGetActiveWithEmbeddingByProject.all(project) as Record<string, unknown>[];
    const results: EntryWithEmbedding[] = [];
    for (const row of rows) {
      try {
        results.push({
          entry: this.rowToEntry(row),
          embedding: deserializeEmbedding(row.embedding as Uint8Array),
        });
      } catch (err) {
        console.warn(
          `[ACM] getActiveWithEmbeddingByProject: skipping corrupt row id="${(row as Record<string, unknown>).id ?? "unknown"}": ` +
            `${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    return results;
  }

  close(): void {
    this.db.close();
  }

  private insertEntry(
    data: Omit<ExperienceEntry, "id">,
    embeddingBlob: Buffer | null
  ): ExperienceEntry | null {
    if (data.signal_strength < 0 || data.signal_strength > 1) {
      throw new Error(`signal_strength must be between 0 and 1, got ${data.signal_strength}`);
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
    const entry: ExperienceEntry = {
      id,
      ...data,
      retrieval_count: data.retrieval_count ?? 0,
      feedback_score: data.feedback_score ?? 0,
    };

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
      entry.interrupt_context ? JSON.stringify(entry.interrupt_context) : null,
      embeddingBlob,
      entry.project ?? null
    );

    return entry;
  }

  private listByType(type: "success" | "failure"): ExperienceEntry[] {
    const rows = this.stmtListByType.all(type) as Record<string, unknown>[];
    return rows.map((row) => this.rowToEntry(row));
  }

  getCrossProjectReport(): ProjectReportRow[] {
    return this.stmtCrossProjectReport.all<ProjectReportRow>();
  }

  getInjectionEpisodes(project?: string, limit?: number): InjectionEpisode[] {
    // Dynamic SQL: project/limit filters are optional, so prepare() is called per invocation.
    // This is acceptable — acm_report is a user-invoked tool, not a hot path.
    let injectionQuery = `
      SELECT session_id, data, timestamp FROM session_signals
      WHERE event_type = 'injection'
    `;
    const params: unknown[] = [];
    if (project) {
      injectionQuery += ` AND json_extract(data, '$.project') = ?`;
      params.push(project);
    }
    injectionQuery += ` ORDER BY timestamp DESC`;
    if (limit !== undefined) {
      injectionQuery += ` LIMIT ?`;
      params.push(limit);
    }

    const injectionRows = this.db.prepare(injectionQuery).all(...params) as Array<{
      session_id: string;
      data: string;
      timestamp: string;
    }>;

    const episodes: InjectionEpisode[] = [];

    for (const row of injectionRows) {
      if (!row.data) {
        console.warn(
          `[ACM] getInjectionEpisodes: skipping injection row with null data for session="${row.session_id}"`
        );
        continue;
      }
      let injectionData: { injected_ids: string[]; project?: string };
      try {
        injectionData = JSON.parse(row.data) as typeof injectionData;
      } catch (err) {
        console.warn(
          `[ACM] Skipping injection row with corrupt data for session="${row.session_id}": ` +
            `${err instanceof Error ? err.message : String(err)}. ` +
            `Data preview: ${String(row.data).slice(0, 200)}`
        );
        continue;
      }

      // Get injected experience entries (skip corrupt entries rather than aborting)
      const injectedExperiences: ExperienceEntry[] = [];
      for (const id of injectionData.injected_ids ?? []) {
        try {
          const entry = this.getById(id);
          if (entry) injectedExperiences.push(entry);
        } catch (err) {
          console.warn(
            `[ACM] getInjectionEpisodes: skipping corrupt injected entry id="${id}" ` +
              `for session="${row.session_id}": ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      // Get session signals summary
      const signalSummary = this.getSessionSignalSummary(row.session_id);

      // Get outcome experiences (generated in same session, skip corrupt rows)
      const outcomeRows = this.stmtOutcomesBySession.all(row.session_id) as Record<
        string,
        unknown
      >[];
      const outcomeExperiences: ExperienceEntry[] = [];
      for (const r of outcomeRows) {
        try {
          outcomeExperiences.push(this.rowToEntry(r));
        } catch (err) {
          const rowId = (r.id as string) ?? "unknown";
          console.warn(
            `[ACM] getInjectionEpisodes: skipping corrupt outcome entry id="${rowId}" ` +
              `for session="${row.session_id}": ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

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

  private getSessionSignalSummary(sessionId: string): SessionSignalSummary {
    const rows = this.stmtSignalSummaryBySession.all(sessionId) as Array<{
      event_type: string;
      count: number;
      has_test_pass: number;
    }>;

    const counts: Record<string, number> = {};
    let hasTestPass = false;
    for (const row of rows) {
      counts[row.event_type] = row.count;
      if (row.has_test_pass === 1) hasTestPass = true;
    }

    return {
      interrupt_count: counts["interrupt"] ?? 0,
      corrective_count: counts["corrective_instruction"] ?? 0,
      tool_success_count: counts["tool_success"] ?? 0,
      had_test_pass: hasTestPass,
      was_stopped_normally: (counts["stop"] ?? 0) > 0,
    };
  }

  private rowToEntry(row: Record<string, unknown>): ExperienceEntry {
    const id = row.id as string;
    try {
      const entry: ExperienceEntry = {
        id,
        type: row.type as ExperienceType,
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
      if (row.project) entry.project = row.project as string;
      if (row.last_retrieved_at) entry.last_retrieved_at = row.last_retrieved_at as string;
      if (row.retrieval_count != null) entry.retrieval_count = row.retrieval_count as number;
      if (row.feedback_score != null) entry.feedback_score = row.feedback_score as number;
      if (row.pinned === 1) entry.pinned = true;
      if (row.archived_at) entry.archived_at = row.archived_at as string;
      return entry;
    } catch (err) {
      throw new Error(
        `Failed to deserialize experience entry id="${id}": ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
    }
  }
}
