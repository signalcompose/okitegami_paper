/**
 * SQLite adapter — wraps sql.js (WASM) with a better-sqlite3-compatible API
 *
 * Provides synchronous-looking Statement interface over sql.js's lower-level API.
 * Persistence: file DBs are written on close() via db.export() + writeFileSync().
 * Tradeoff: all writes are held in WASM memory and flushed only on close().
 * A SIGKILL before close() loses in-session data (accepted for short-lived hooks).
 */

import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

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

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;

let sqlPromise: Promise<SqlJsStatic> | null = null;

function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs().catch((err) => {
      sqlPromise = null; // Allow retry on next call
      throw err;
    });
  }
  return sqlPromise!;
}

export async function openDatabase(dbPath: string): Promise<AdaptedDatabase> {
  const SQL = await getSql();
  let db: SqlJsDatabase;

  if (dbPath === ":memory:") {
    db = new SQL.Database();
  } else {
    mkdirSync(dirname(dbPath), { recursive: true });
    const data = existsSync(dbPath) ? readFileSync(dbPath) : undefined;
    db = data ? new SQL.Database(data) : new SQL.Database();
  }

  return wrapDatabase(db, dbPath);
}

function wrapDatabase(db: SqlJsDatabase, dbPath: string): AdaptedDatabase {
  return {
    prepare(sql: string): Statement {
      return wrapStatement(db, sql);
    },
    exec(sql: string): void {
      db.run(sql);
    },
    close(): void {
      if (dbPath !== ":memory:") {
        try {
          const data = db.export();
          writeFileSync(dbPath, data);
        } catch (writeErr) {
          console.error(
            `[ACM] Failed to persist DB to "${dbPath}". Session data may be lost. ` +
              `Error: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`
          );
          db.close();
          throw writeErr;
        }
      }
      db.close();
    },
  };
}

function getLastInsertRowid(db: SqlJsDatabase): number {
  const stmt = db.prepare("SELECT last_insert_rowid() as rid");
  try {
    stmt.step();
    const row = stmt.getAsObject();
    if (row.rid == null) {
      throw new Error("[ACM] sqlite-adapter: last_insert_rowid() returned no value");
    }
    return row.rid as number;
  } finally {
    stmt.free();
  }
}

function wrapStatement(db: SqlJsDatabase, sql: string): Statement {
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
    run(...params: unknown[]): RunResult {
      const stmt = db.prepare(sql);
      try {
        if (params.length > 0) {
          stmt.bind(params as Parameters<typeof stmt.bind>[0]);
        }
        stmt.step();
        return {
          changes: db.getRowsModified(),
          lastInsertRowid: getLastInsertRowid(db),
        };
      } finally {
        stmt.free();
      }
    },
    get<T = Record<string, unknown>>(...params: unknown[]): T | undefined {
      const stmt = db.prepare(sql);
      try {
        if (params.length > 0) {
          stmt.bind(params as Parameters<typeof stmt.bind>[0]);
        }
        const hasRow = stmt.step();
        return hasRow ? (stmt.getAsObject() as T) : undefined;
      } finally {
        stmt.free();
      }
    },
    all<T = Record<string, unknown>>(...params: unknown[]): T[] {
      const stmt = db.prepare(sql);
      try {
        if (params.length > 0) {
          stmt.bind(params as Parameters<typeof stmt.bind>[0]);
        }
        const rows: T[] = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject() as T);
        }
        return rows;
      } finally {
        stmt.free();
      }
    },
  };
}
