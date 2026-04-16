/**
 * Common bootstrap module for ACM hooks
 * Issue #37: feat(hooks): common bootstrap module for ACM hooks
 *
 * Each hook script calls bootstrapHook() with raw stdin.
 * Returns null for silent exit (ACM not configured or disabled).
 * Returns initialized stores + parsed input for active hooks.
 */
import { basename } from "node:path";
import { loadConfig } from "../config.js";
import { initializeDatabase } from "../store/schema.js";
import { SessionSignalStore } from "../signals/session-store.js";
import { ExperienceStore } from "../store/experience-store.js";
import { SignalCollector } from "../signals/signal-collector.js";
import { JsonlLogger } from "../logging/jsonl-logger.js";
import { VERBOSITY_LEVELS } from "../store/types.js";
/**
 * Apply CLAUDE_PLUGIN_OPTION_* environment variable overrides to config.
 * These are set by the Claude Code plugin userConfig system.
 */
export function applyPluginOptionOverrides(config) {
    const ollamaUrl = process.env.CLAUDE_PLUGIN_OPTION_OLLAMA_URL?.trim();
    if (ollamaUrl) {
        config.ollama_url = ollamaUrl;
    }
    const ollamaModel = process.env.CLAUDE_PLUGIN_OPTION_OLLAMA_MODEL?.trim();
    if (ollamaModel) {
        config.ollama_model = ollamaModel;
    }
    const verbosity = process.env.CLAUDE_PLUGIN_OPTION_VERBOSITY?.trim();
    if (verbosity) {
        if (VERBOSITY_LEVELS.includes(verbosity)) {
            config.verbosity = verbosity;
        }
        else {
            console.error(`[ACM] CLAUDE_PLUGIN_OPTION_VERBOSITY: invalid value "${verbosity}". ` +
                `Expected one of: ${VERBOSITY_LEVELS.join(", ")}. Using default "${config.verbosity}".`);
        }
    }
    const maxExp = process.env.CLAUDE_PLUGIN_OPTION_MAX_EXPERIENCES_PER_PROJECT?.trim();
    if (maxExp) {
        const n = Number(maxExp);
        if (Number.isInteger(n) && n >= 10) {
            config.max_experiences_per_project = n;
        }
        else {
            console.error(`[ACM] CLAUDE_PLUGIN_OPTION_MAX_EXPERIENCES_PER_PROJECT: invalid value "${maxExp}". ` +
                `Expected integer >= 10. Using default ${config.max_experiences_per_project}.`);
        }
    }
}
export async function bootstrapHook(stdin) {
    // Load config: use ACM_CONFIG_PATH if set, otherwise fall back to DEFAULT_CONFIG
    const config = loadConfig(process.env.ACM_CONFIG_PATH || undefined);
    // Apply plugin userConfig overrides (CLAUDE_PLUGIN_OPTION_* env vars)
    applyPluginOptionOverrides(config);
    if (config.mode === "disabled") {
        return null;
    }
    // Parse stdin
    let input;
    try {
        input = JSON.parse(stdin);
    }
    catch (err) {
        throw new Error(`Invalid JSON in hook stdin: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
    // Initialize DB and stores (async for sql.js WASM)
    const db = await initializeDatabase(config.db_path);
    try {
        const signalStore = new SessionSignalStore(db);
        const experienceStore = new ExperienceStore(db, config);
        const collector = new SignalCollector(signalStore, {
            capture_turns: config.capture_turns,
        });
        const projectName = basename(input.cwd || "") || "unknown";
        const logDir = JsonlLogger.resolveLogDir(process.env.CLAUDE_PLUGIN_DATA || undefined);
        const logger = new JsonlLogger(logDir);
        return {
            input,
            config,
            signalStore,
            experienceStore,
            collector,
            projectName,
            logger,
            cleanup: () => {
                try {
                    db.close();
                }
                catch (err) {
                    // db.close() already logged the write error; re-throw with hook context
                    throw new Error(`[ACM] Failed to close/persist DB. Session data may be lost.`, {
                        cause: err,
                    });
                }
            },
        };
    }
    catch (constructErr) {
        try {
            db.close();
        }
        catch (closeErr) {
            console.error(`[ACM] bootstrapHook: db.close() also failed during error cleanup: ` +
                `${closeErr instanceof Error ? closeErr.message : String(closeErr)}`);
        }
        throw constructErr;
    }
}
/**
 * Validate that a required string field exists in hook input.
 * Throws a descriptive error if the field is missing or not a string.
 */
export function requireInputString(input, field, hookName) {
    const value = input[field];
    if (typeof value !== "string" || !value) {
        throw new Error(`${hookName}: missing or invalid "${field}" in input. ` +
            `Got: ${JSON.stringify(value)}. Keys present: ${Object.keys(input).join(", ")}`);
    }
    return value;
}
/**
 * Shared entry point for hook scripts.
 * Reads stdin, calls handler, handles errors.
 * Supports both sync and async handlers.
 * Exits with code 0 on success, code 1 on unhandled errors.
 */
export function runAsHookScript(handler, hookName) {
    let stdin = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("error", (err) => {
        console.error(`[ACM hook error] ${hookName}: stdin error: ${err.message}`);
        process.exit(1);
    });
    process.stdin.on("data", (chunk) => {
        stdin += chunk;
    });
    process.stdin.on("end", () => {
        Promise.resolve(handler(stdin))
            .then(() => {
            process.exit(0);
        })
            .catch((err) => {
            const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
            console.error(`[ACM hook error] ${hookName}: ${message}`);
            process.exit(1);
        });
    });
}
//# sourceMappingURL=_common.js.map