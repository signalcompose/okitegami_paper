import type { AdaptedDatabase } from "./sqlite-adapter.js";
import type { ExperienceEntry, AcmConfig, ProjectReportRow, InjectionEpisode, RecurrenceRateRow, TemporalTrendRow, InjectionOutcomeRow, CrossProjectTransferRow, MeasurementReport } from "./types.js";
export interface EntryWithEmbedding {
    entry: ExperienceEntry;
    embedding: Float32Array;
}
export declare class ExperienceStore {
    private db;
    private config;
    private stmtInsert;
    private stmtGetById;
    private stmtList;
    private stmtListByType;
    private stmtDelete;
    private stmtUpdateEmbedding;
    private stmtAllWithEmbedding;
    private stmtAllWithEmbeddingByType;
    private stmtOutcomesBySession;
    private stmtExistsForSession;
    private stmtCrossProjectReport;
    private stmtSignalSummaryBySession;
    constructor(db: AdaptedDatabase, config: AcmConfig);
    getDb(): AdaptedDatabase;
    create(data: Omit<ExperienceEntry, "id">): ExperienceEntry | null;
    createWithEmbedding(data: Omit<ExperienceEntry, "id">, embedding: Float32Array): ExperienceEntry | null;
    getById(id: string): ExperienceEntry | null;
    hasEntriesForSession(sessionId: string): boolean;
    list(options?: {
        limit?: number;
    }): ExperienceEntry[];
    listByMode(): ExperienceEntry[];
    updateEmbedding(id: string, embedding: Float32Array): boolean;
    getAllWithEmbedding(): EntryWithEmbedding[];
    delete(id: string): boolean;
    getRecurrenceRate(project?: string): RecurrenceRateRow[];
    getTemporalTrend(project?: string): TemporalTrendRow[];
    getInjectionOutcomeCorrelation(project?: string): InjectionOutcomeRow[];
    getCrossProjectTransfer(): CrossProjectTransferRow[];
    getMeasurementReport(project?: string): MeasurementReport;
    /** Update retrieval tracking: increment count and set last_retrieved_at */
    updateRetrievalTracking(id: string): void;
    /** Adjust feedback_score by delta (+1 or -1) */
    adjustFeedbackScore(id: string, delta: number): void;
    /** Pin/unpin an experience entry */
    setPinned(id: string, pinned: boolean): boolean;
    /** Soft-delete (archive) an experience entry */
    archive(id: string): boolean;
    /** Count active (non-archived) entries for a project */
    countActiveByProject(project: string): number;
    /** Get eviction candidates: lowest-scored active entries that are not protected */
    getEvictionCandidates(project: string, limit: number, protectedFeedbackThreshold?: number): ExperienceEntry[];
    /** Get all active entries with embeddings for a project (for clustering) */
    getActiveWithEmbeddingByProject(project: string): EntryWithEmbedding[];
    close(): void;
    private insertEntry;
    private listByType;
    getCrossProjectReport(): ProjectReportRow[];
    getInjectionEpisodes(project?: string, limit?: number): InjectionEpisode[];
    private getSessionSignalSummary;
    private rowToEntry;
}
//# sourceMappingURL=experience-store.d.ts.map