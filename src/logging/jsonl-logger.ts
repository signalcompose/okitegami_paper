/**
 * JSONL operational logger for ACM hooks (Issue #89)
 *
 * Layer 3 of the 3-layer logging architecture:
 *   Layer 1: console.error (real-time diagnostics)
 *   Layer 2: SQLite acm_logs (structured queries)
 *   Layer 3: JSONL files (operational logs / debugging)
 *
 * All log writes are best-effort — failures are caught and reported
 * to stderr but never abort the primary hook operation.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type LogCategory =
  | "injection"
  | "detection"
  | "generation"
  | "retrieval"
  | "llm_eval"
  | "error"
  | "skip";

export interface LogEntry {
  timestamp: string;
  category: LogCategory;
  event: string;
  data: Record<string, unknown>;
}

export class JsonlLogger {
  private readonly logDir: string;
  private dirEnsured = false;

  constructor(logDir: string) {
    this.logDir = logDir;
  }

  /**
   * Resolve the log directory path from environment.
   * Uses CLAUDE_PLUGIN_DATA/logs when available, falls back to ~/.acm/logs.
   */
  static resolveLogDir(pluginDataDir: string | undefined): string {
    if (pluginDataDir) {
      return join(pluginDataDir, "logs");
    }
    return join(homedir(), ".acm", "logs");
  }

  /**
   * Write a log entry. Best-effort: never throws.
   */
  log(category: LogCategory, event: string, data: Record<string, unknown>): void {
    try {
      if (!this.dirEnsured) {
        mkdirSync(this.logDir, { recursive: true });
        this.dirEnsured = true;
      }

      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        category,
        event,
        data,
      };

      const filename = `acm-${entry.timestamp.slice(0, 10)}.jsonl`;
      appendFileSync(join(this.logDir, filename), JSON.stringify(entry) + "\n");
    } catch (err) {
      console.error(
        `[ACM] jsonl-logger: failed to write log entry: ` +
          `${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
