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
    constructor(logDir: string);
    /**
     * Resolve the log directory path from environment.
     * Uses CLAUDE_PLUGIN_DATA/logs when available, falls back to ~/.acm/logs.
     */
    static resolveLogDir(pluginDataDir: string | undefined): string;
    /**
     * Write a log entry. Best-effort: never throws.
     */
    log(category: LogCategory, event: string, data: Record<string, unknown>): void;
}
//# sourceMappingURL=jsonl-logger.d.ts.map