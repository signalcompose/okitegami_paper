import { openDatabase, type AdaptedDatabase } from "./sqlite-adapter.js";
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

function migrateDatabase(db: AdaptedDatabase): void {
  // Additive migration: add project column if missing (backward compat with pre-report DBs)
  const columns = db.prepare("PRAGMA table_info(experiences)").all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((c) => c.name));

  if (!columnNames.has("project")) {
    db.exec("ALTER TABLE experiences ADD COLUMN project TEXT");
  }
  // Always ensure project index exists (handles both fresh and migrated DBs)
  db.exec("CREATE INDEX IF NOT EXISTS idx_experiences_project ON experiences(project)");

  // Migration: rebuild session_signals CHECK constraint to include new event types (e.g. tool_failure).
  // SQLite does not support ALTER CONSTRAINT, so we recreate the table if the constraint is stale.
  const createSql = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='session_signals'")
    .get() as { sql: string } | undefined;
  if (createSql && !createSql.sql.includes("'tool_failure'")) {
    const rebuildSql = [
      "ALTER TABLE session_signals RENAME TO session_signals_old",
      `CREATE TABLE session_signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK(event_type IN (${EVENT_TYPES_SQL})),
        data TEXT,
        timestamp TEXT NOT NULL
      )`,
      `INSERT INTO session_signals (id, session_id, event_type, data, timestamp)
        SELECT id, session_id, event_type, data, timestamp FROM session_signals_old`,
      "DROP TABLE session_signals_old",
      "CREATE INDEX IF NOT EXISTS idx_session_signals_session_id ON session_signals(session_id)",
      "CREATE INDEX IF NOT EXISTS idx_session_signals_session_event ON session_signals(session_id, event_type)",
    ];
    for (const sql of rebuildSql) {
      db.exec(sql);
    }
  }
}

export async function initializeDatabase(dbPath: string): Promise<AdaptedDatabase> {
  const db = await openDatabase(dbPath);
  db.exec(SCHEMA_SQL);
  migrateDatabase(db);
  return db;
}
