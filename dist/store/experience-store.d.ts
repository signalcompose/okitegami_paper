import type { AdaptedDatabase } from "./sqlite-adapter.js";
import type { ExperienceEntry, AcmConfig, ProjectReportRow, InjectionEpisode } from "./types.js";
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
    close(): void;
    private insertEntry;
    private listByType;
    getCrossProjectReport(): ProjectReportRow[];
    getInjectionEpisodes(project?: string, limit?: number): InjectionEpisode[];
    private getSessionSignalSummary;
    private rowToEntry;
}
//# sourceMappingURL=experience-store.d.ts.map