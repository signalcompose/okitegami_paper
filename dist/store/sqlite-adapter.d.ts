/**
 * SQLite adapter — wraps sql.js (WASM) with a better-sqlite3-compatible API
 *
 * Provides synchronous-looking Statement interface over sql.js's lower-level API.
 * Persistence: file DBs are written on close() via db.export() + writeFileSync().
 * Tradeoff: all writes are held in WASM memory and flushed only on close().
 * A SIGKILL before close() loses in-session data (accepted for short-lived hooks).
 */
export interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
}
export interface Statement {
    run(...params: unknown[]): RunResult;
    get<T = Record<string, unknown>>(...params: unknown[]): T | undefined;
    all<T = Record<string, unknown>>(...params: unknown[]): T[];
}
export interface AdaptedDatabase {
    prepare(sql: string): Statement;
    exec(sql: string): void;
    close(): void;
}
export declare function openDatabase(dbPath: string): Promise<AdaptedDatabase>;
//# sourceMappingURL=sqlite-adapter.d.ts.map