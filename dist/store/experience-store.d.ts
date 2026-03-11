import type Database from "better-sqlite3";
import type { ExperienceEntry, AcmConfig } from "./types.js";
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
    constructor(config: AcmConfig);
    getDb(): Database.Database;
    create(data: Omit<ExperienceEntry, "id">): ExperienceEntry | null;
    createWithEmbedding(data: Omit<ExperienceEntry, "id">, embedding: Float32Array): ExperienceEntry | null;
    getById(id: string): ExperienceEntry | null;
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
    private rowToEntry;
}
//# sourceMappingURL=experience-store.d.ts.map