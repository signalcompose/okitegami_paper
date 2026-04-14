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
export class JsonlLogger {
    logDir;
    dirEnsured = false;
    constructor(logDir) {
        this.logDir = logDir;
    }
    /**
     * Resolve the log directory path from environment.
     * Uses CLAUDE_PLUGIN_DATA/logs when available, falls back to ~/.acm/logs.
     */
    static resolveLogDir(pluginDataDir) {
        if (pluginDataDir && pluginDataDir.trim()) {
            return join(pluginDataDir, "logs");
        }
        return join(homedir(), ".acm", "logs");
    }
    /**
     * Write a log entry. Best-effort: never throws.
     */
    log(category, event, data) {
        try {
            if (!this.dirEnsured) {
                mkdirSync(this.logDir, { recursive: true });
                this.dirEnsured = true;
            }
            const entry = {
                timestamp: new Date().toISOString(),
                category,
                event,
                data,
            };
            const filename = `acm-${entry.timestamp.slice(0, 10)}.jsonl`;
            appendFileSync(join(this.logDir, filename), JSON.stringify(entry) + "\n");
        }
        catch (err) {
            this.dirEnsured = false;
            console.error(`[ACM] jsonl-logger: failed to write ${category}/${event}: ` +
                `${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
//# sourceMappingURL=jsonl-logger.js.map