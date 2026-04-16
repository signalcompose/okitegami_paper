/**
 * SessionSignalStore — SQLite CRUD for session signals
 * SPECIFICATION.md Section 3
 */
import type { AdaptedDatabase } from "../store/sqlite-adapter.js";
import type { EventType, SessionSignal } from "./types.js";
export declare class SessionSignalStore {
    private db;
    private insertStmt;
    private getBySessionStmt;
    private getBySessionAfterStmt;
    private countByTypeStmt;
    private countByTypeAfterStmt;
    private clearSessionStmt;
    private countSpecificTypesStmt;
    private hasTestPassStmt;
    private hasTestPassAfterStmt;
    private hasSignalOfTypeStmt;
    constructor(db: AdaptedDatabase);
    addSignal(sessionId: string, eventType: EventType, data: Record<string, unknown> | null): SessionSignal;
    getBySession(sessionId: string, after?: string): SessionSignal[];
    /** @deprecated Use getBySession(sessionId, after) instead */
    getBySessionAfter(sessionId: string, afterTimestamp: string): SessionSignal[];
    countByType(sessionId: string, after?: string): Record<EventType, number>;
    /** @deprecated Use countByType(sessionId, after) instead */
    countByTypeAfter(sessionId: string, afterTimestamp: string): Record<EventType, number>;
    countSpecificTypes(sessionId: string, type1: EventType, type2: EventType): Record<string, number>;
    hasTestPass(sessionId: string, after?: string): boolean;
    /** @deprecated Use hasTestPass(sessionId, after) instead */
    hasTestPassAfter(sessionId: string, afterTimestamp: string): boolean;
    hasSignalOfType(sessionId: string, eventType: EventType): boolean;
    clearSession(sessionId: string): number;
    private mapRows;
    private buildCounts;
    private parseData;
}
//# sourceMappingURL=session-store.d.ts.map