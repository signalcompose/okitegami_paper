import { openDatabase, type AdaptedDatabase } from "./sqlite-adapter.js";
import { EVENT_TYPES } from "../signals/types.js";

const EVENT_TYPES_SQL = EVENT_TYPES.map((t) => `'${t}'`).join(",");

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS experiences (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('success', 'failure', 'insight')),
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
  project TEXT,
  last_retrieved_at TEXT,
  retrieval_count INTEGER NOT NULL DEFAULT 0,
  feedback_score INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT
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

  // GC columns migration (Issue #91)
  const gcColumns: Array<{ name: string; definition: string }> = [
    { name: "last_retrieved_at", definition: "TEXT" },
    { name: "retrieval_count", definition: "INTEGER NOT NULL DEFAULT 0" },
    { name: "feedback_score", definition: "INTEGER NOT NULL DEFAULT 0" },
    { name: "pinned", definition: "INTEGER NOT NULL DEFAULT 0" },
    { name: "archived_at", definition: "TEXT" },
  ];
  for (const col of gcColumns) {
    if (!columnNames.has(col.name)) {
      db.exec(`ALTER TABLE experiences ADD COLUMN ${col.name} ${col.definition}`);
    }
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_experiences_archived ON experiences(archived_at)");

  // Migrate type CHECK constraint to include 'insight' if needed
  const expCreateSql = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='experiences'")
    .get() as { sql: string } | undefined;
  if (expCreateSql && !expCreateSql.sql.includes("'insight'")) {
    db.exec("BEGIN");
    try {
      db.exec("ALTER TABLE experiences RENAME TO experiences_old");
      db.exec(SCHEMA_SQL);
      db.exec(
        `INSERT INTO experiences SELECT id, type, trigger_text, action_text, outcome_text,
          retrieval_keys, signal_strength, signal_type, session_id, timestamp,
          interrupt_context, embedding, project, last_retrieved_at, retrieval_count,
          feedback_score, pinned, archived_at
        FROM experiences_old`
      );
      db.exec("DROP TABLE experiences_old");
      db.exec("COMMIT");
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch (rollbackErr) {
        console.error(
          `[ACM] migrateDatabase: ROLLBACK failed during experiences type migration. ` +
            `Original: ${err instanceof Error ? err.message : String(err)}. ` +
            `ROLLBACK: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`
        );
      }
      throw err;
    }
  }

  // Migration: rebuild session_signals CHECK constraint to include all current EVENT_TYPES.
  // SQLite does not support ALTER CONSTRAINT, so we recreate the table if the constraint is stale.
  // Guard: compare stored CHECK constraint against current EVENT_TYPES_SQL to detect staleness.
  // NOTE: When adding new event types to EVENT_TYPES, this migration runs automatically.
  const createSql = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='session_signals'")
    .get() as { sql: string } | undefined;
  if (createSql && !createSql.sql.includes(EVENT_TYPES_SQL)) {
    db.exec("BEGIN");
    try {
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
      db.exec("COMMIT");
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch (rollbackErr) {
        console.error(
          `[ACM] migrateDatabase: ROLLBACK failed after migration error. ` +
            `DB state may be inconsistent. Original: ${err instanceof Error ? err.message : String(err)}. ` +
            `ROLLBACK: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`
        );
      }
      throw err;
    }
  }
}

export async function initializeDatabase(dbPath: string): Promise<AdaptedDatabase> {
  const db = await openDatabase(dbPath);
  db.exec(SCHEMA_SQL);
  migrateDatabase(db);
  return db;
}
