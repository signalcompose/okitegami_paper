/**
 * SQLite adapter — wraps sql.js (WASM) with a better-sqlite3-compatible API
 *
 * Provides synchronous-looking Statement interface over sql.js's lower-level API.
 * Persistence: file DBs are written on close() via db.export() + writeFileSync().
 * Tradeoff: all writes are held in WASM memory and flushed only on close().
 * A SIGKILL before close() loses in-session data (accepted for short-lived hooks).
 */
import initSqlJs from "sql.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
let sqlPromise = null;
function getSql() {
    if (!sqlPromise) {
        sqlPromise = initSqlJs().catch((err) => {
            sqlPromise = null; // Allow retry on next call
            throw err;
        });
    }
    return sqlPromise;
}
export async function openDatabase(dbPath) {
    const SQL = await getSql();
    let db;
    if (dbPath === ":memory:") {
        db = new SQL.Database();
    }
    else {
        mkdirSync(dirname(dbPath), { recursive: true });
        const data = existsSync(dbPath) ? readFileSync(dbPath) : undefined;
        db = data ? new SQL.Database(data) : new SQL.Database();
    }
    return wrapDatabase(db, dbPath);
}
function wrapDatabase(db, dbPath) {
    return {
        prepare(sql) {
            return wrapStatement(db, sql);
        },
        exec(sql) {
            db.run(sql);
        },
        close() {
            try {
                if (dbPath !== ":memory:") {
                    try {
                        const data = db.export();
                        writeFileSync(dbPath, data);
                    }
                    catch (writeErr) {
                        console.error(`[ACM] Failed to persist DB to "${dbPath}". Session data may be lost. ` +
                            `Error: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`);
                        throw writeErr;
                    }
                }
            }
            finally {
                db.close();
            }
        },
    };
}
function getLastInsertRowid(db) {
    const stmt = db.prepare("SELECT last_insert_rowid() as rid");
    try {
        stmt.step();
        const row = stmt.getAsObject();
        if (row.rid == null) {
            throw new Error("[ACM] sqlite-adapter: last_insert_rowid() returned no value");
        }
        return row.rid;
    }
    finally {
        stmt.free();
    }
}
function wrapStatement(db, sql) {
    // Eagerly compile SQL to match better-sqlite3's early-error-detection behavior.
    // sql.js prepare() validates syntax immediately.
    const compiled = db.prepare(sql);
    compiled.free(); // Free the validation statement; re-prepare per call below.
    // NOTE: sql.js statements are single-use (step→free cycle). Unlike better-sqlite3
    // which reuses compiled statements, we re-prepare per call. This is acceptable
    // for hook processes that run briefly and exit.
    // Note: getRowsModified() is called immediately after step(); any intermediate
    // statement execution would invalidate the count.
    return {
        run(...params) {
            const stmt = db.prepare(sql);
            try {
                if (params.length > 0) {
                    stmt.bind(params);
                }
                stmt.step();
                return {
                    changes: db.getRowsModified(),
                    lastInsertRowid: getLastInsertRowid(db),
                };
            }
            finally {
                stmt.free();
            }
        },
        get(...params) {
            const stmt = db.prepare(sql);
            try {
                if (params.length > 0) {
                    stmt.bind(params);
                }
                const hasRow = stmt.step();
                return hasRow ? stmt.getAsObject() : undefined;
            }
            finally {
                stmt.free();
            }
        },
        all(...params) {
            const stmt = db.prepare(sql);
            try {
                if (params.length > 0) {
                    stmt.bind(params);
                }
                const rows = [];
                while (stmt.step()) {
                    rows.push(stmt.getAsObject());
                }
                return rows;
            }
            finally {
                stmt.free();
            }
        },
    };
}
//# sourceMappingURL=sqlite-adapter.js.map