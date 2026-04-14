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
  private failureReported = false;

  constructor(logDir: string) {
    this.logDir = logDir;
  }

  /**
   * Resolve the log directory path. `pluginDataDir` should be
   * `process.env.CLAUDE_PLUGIN_DATA` (pass `undefined` if absent).
   * Returns `pluginDataDir/logs` when non-empty/non-whitespace;
   * otherwise falls back to `~/.acm/logs`.
   */
  static resolveLogDir(pluginDataDir: string | undefined): string {
    if (pluginDataDir && pluginDataDir.trim()) {
      return join(pluginDataDir, "logs");
    }
    return join(homedir(), ".acm", "logs");
  }

  /**
   * Write a log entry. Best-effort: never throws.
   * On first failure, reports to stderr and suppresses subsequent
   * failures for the lifetime of this logger instance.
   */
  log(category: LogCategory, event: string, data: Record<string, unknown>): void {
    if (this.failureReported) return;
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
      this.failureReported = true;
      console.error(
        `[ACM] jsonl-logger: logging degraded, suppressing further failures. ` +
          `First failure (${category}/${event}): ` +
          `${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
