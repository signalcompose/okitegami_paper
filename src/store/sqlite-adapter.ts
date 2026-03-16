/**
 * SQLite adapter — wraps sql.js (WASM) with a better-sqlite3-compatible API
 *
 * Provides synchronous-looking Statement interface over sql.js's lower-level API.
 * Persistence: file DBs are written on close() via db.export() + writeFileSync().
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
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
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
    sqlPromise = initSqlJs();
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
        const data = db.export();
        writeFileSync(dbPath, Buffer.from(data));
      }
      db.close();
    },
  };
}

function getLastInsertRowid(db: SqlJsDatabase): number {
  const stmt = db.prepare("SELECT last_insert_rowid() as rid");
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return row.rid as number;
}

function wrapStatement(db: SqlJsDatabase, sql: string): Statement {
  return {
    run(...params: unknown[]): RunResult {
      const stmt = db.prepare(sql);
      if (params.length > 0) {
        stmt.bind(params as Parameters<typeof stmt.bind>[0]);
      }
      stmt.step();
      stmt.free();
      return {
        changes: db.getRowsModified(),
        lastInsertRowid: getLastInsertRowid(db),
      };
    },
    get(...params: unknown[]): Record<string, unknown> | undefined {
      const stmt = db.prepare(sql);
      if (params.length > 0) {
        stmt.bind(params as Parameters<typeof stmt.bind>[0]);
      }
      const hasRow = stmt.step();
      const row = hasRow ? (stmt.getAsObject() as Record<string, unknown>) : undefined;
      stmt.free();
      return row;
    },
    all(...params: unknown[]): Record<string, unknown>[] {
      const stmt = db.prepare(sql);
      if (params.length > 0) {
        stmt.bind(params as Parameters<typeof stmt.bind>[0]);
      }
      const rows: Record<string, unknown>[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as Record<string, unknown>);
      }
      stmt.free();
      return rows;
    },
  };
}
