export type LogCategory = "injection" | "detection" | "generation" | "retrieval" | "llm_eval" | "error" | "skip";
export interface LogEntry {
    timestamp: string;
    category: LogCategory;
    event: string;
    data: Record<string, unknown>;
}
export declare class JsonlLogger {
    private readonly logDir;
    private dirEnsured;
    private failureReported;
    constructor(logDir: string);
    /**
     * Resolve the log directory path. `pluginDataDir` should be
     * `process.env.CLAUDE_PLUGIN_DATA` (pass `undefined` if absent).
     * Returns `pluginDataDir/logs` when non-empty/non-whitespace;
     * otherwise falls back to `~/.acm/logs`.
     */
    static resolveLogDir(pluginDataDir: string | undefined): string;
    /**
     * Write a log entry. Best-effort: never throws.
     * On first failure, reports to stderr and suppresses subsequent
     * failures for the lifetime of this logger instance.
     */
    log(category: LogCategory, event: string, data: Record<string, unknown>): void;
}
//# sourceMappingURL=jsonl-logger.d.ts.map