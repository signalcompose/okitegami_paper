import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ACM_MODES, DEFAULT_CONFIG } from "./store/types.js";
const KNOWN_CONFIG_KEYS = new Set([
    "mode",
    "top_k",
    "capture_turns",
    "promotion_threshold",
    "db_path",
]);
export function expandTilde(filePath) {
    if (filePath === "~") {
        return homedir();
    }
    if (filePath.startsWith("~/")) {
        return join(homedir(), filePath.slice(2));
    }
    return filePath;
}
function validate(config) {
    if (!ACM_MODES.includes(config.mode)) {
        throw new Error(`Invalid mode "${config.mode}". Must be one of: ${ACM_MODES.join(", ")}`);
    }
    if (config.promotion_threshold < 0 || config.promotion_threshold > 1) {
        throw new Error(`promotion_threshold must be between 0 and 1, got ${config.promotion_threshold}`);
    }
    if (config.top_k < 1) {
        throw new Error(`top_k must be >= 1, got ${config.top_k}`);
    }
    if (config.capture_turns < 1) {
        throw new Error(`capture_turns must be >= 1, got ${config.capture_turns}`);
    }
}
export function loadConfig(pathOrOptions) {
    const opts = typeof pathOrOptions === "string" ? { path: pathOrOptions } : (pathOrOptions ?? {});
    let overrides = {};
    if (opts.path) {
        let raw;
        try {
            raw = readFileSync(opts.path, "utf-8");
        }
        catch (err) {
            throw new Error(`Cannot read config file "${opts.path}": ${err instanceof Error ? err.message : String(err)}`, { cause: err });
        }
        try {
            overrides = JSON.parse(raw);
        }
        catch (err) {
            throw new Error(`Invalid JSON in config file "${opts.path}": ${err instanceof Error ? err.message : String(err)}`, { cause: err });
        }
        const unknownKeys = Object.keys(overrides).filter((k) => !KNOWN_CONFIG_KEYS.has(k));
        if (unknownKeys.length > 0) {
            throw new Error(`Unknown config keys: ${unknownKeys.join(", ")}. Valid keys: ${[...KNOWN_CONFIG_KEYS].join(", ")}`);
        }
    }
    const dbPath = (opts.dbPathOverride || undefined) ?? overrides.db_path ?? DEFAULT_CONFIG.db_path;
    const config = {
        ...DEFAULT_CONFIG,
        ...overrides,
        db_path: expandTilde(dbPath),
    };
    validate(config);
    return config;
}
//# sourceMappingURL=config.js.map