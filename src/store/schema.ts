import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { EVENT_TYPES } from "../signals/types.js";

const EVENT_TYPES_SQL = EVENT_TYPES.map((t) => `'${t}'`).join(",");

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS experiences (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('success', 'failure')),
  trigger_text TEXT NOT NULL,
  action_text TEXT NOT NULL,
  outcome_text TEXT NOT NULL,
  retrieval_keys TEXT NOT NULL,
  signal_strength REAL NOT NULL,
  signal_type TEXT NOT NULL CHECK(signal_type IN ('interrupt_with_dialogue','rewind','corrective_instruction','uninterrupted_completion')),
  session_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  interrupt_context TEXT,
  embedding BLOB,
  project TEXT
);

CREATE INDEX IF NOT EXISTS idx_experiences_type
  ON experiences(type);
CREATE INDEX IF NOT EXISTS idx_experiences_signal_strength
  ON experiences(signal_strength);
CREATE INDEX IF NOT EXISTS idx_experiences_timestamp
  ON experiences(timestamp);

CREATE TABLE IF NOT EXISTS session_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN (${EVENT_TYPES_SQL})),
  data TEXT,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_signals_session_id
  ON session_signals(session_id);

CREATE INDEX IF NOT EXISTS idx_session_signals_session_event
  ON session_signals(session_id, event_type);
`;

function migrateDatabase(db: Database.Database): void {
  // Additive migration: add project column if missing (backward compat with pre-report DBs)
  const columns = db.prepare("PRAGMA table_info(experiences)").all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((c) => c.name));

  if (!columnNames.has("project")) {
    db.exec("ALTER TABLE experiences ADD COLUMN project TEXT");
  }
  // Always ensure project index exists (handles both fresh and migrated DBs)
  db.exec("CREATE INDEX IF NOT EXISTS idx_experiences_project ON experiences(project)");
}

export function initializeDatabase(dbPath: string): Database.Database {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA_SQL);
  migrateDatabase(db);
  return db;
}
