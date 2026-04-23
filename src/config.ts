import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AcmConfig, ACM_MODES, VERBOSITY_LEVELS, DEFAULT_CONFIG } from "./store/types.js";

const KNOWN_CONFIG_KEYS = new Set<string>([
  "mode",
  "top_k",
  "capture_turns",
  "promotion_threshold",
  "db_path",
  "verbosity",
  "ollama_url",
  "ollama_model",
  "max_experiences_per_project",
  "recency_half_life_days",
  "inject_corrective_bodies_score_threshold",
  "inject_corrective_bodies_max",
  "embedder_init_timeout_ms",
  "pre_compact_budget_ms",
]);

export function expandTilde(filePath: string): string {
  if (filePath === "~") {
    return homedir();
  }
  if (filePath.startsWith("~/")) {
    return join(homedir(), filePath.slice(2));
  }
  return filePath;
}

function validate(config: AcmConfig): void {
  if (!ACM_MODES.includes(config.mode)) {
    throw new Error(`Invalid mode "${config.mode}". Must be one of: ${ACM_MODES.join(", ")}`);
  }
  if (!VERBOSITY_LEVELS.includes(config.verbosity)) {
    throw new Error(
      `Invalid verbosity "${config.verbosity}". Must be one of: ${VERBOSITY_LEVELS.join(", ")}`
    );
  }
  if (config.promotion_threshold < 0 || config.promotion_threshold > 1) {
    throw new Error(
      `promotion_threshold must be between 0 and 1, got ${config.promotion_threshold}`
    );
  }
  if (config.top_k < 1) {
    throw new Error(`top_k must be >= 1, got ${config.top_k}`);
  }
  if (config.capture_turns < 1) {
    throw new Error(`capture_turns must be >= 1, got ${config.capture_turns}`);
  }
  if (config.max_experiences_per_project < 10) {
    throw new Error(
      `max_experiences_per_project must be >= 10, got ${config.max_experiences_per_project}`
    );
  }
  if (config.recency_half_life_days <= 0) {
    throw new Error(`recency_half_life_days must be > 0, got ${config.recency_half_life_days}`);
  }
}

export interface LoadConfigOptions {
  path?: string;
  dbPathOverride?: string;
}

export function loadConfig(pathOrOptions?: string | LoadConfigOptions): AcmConfig {
  const opts: LoadConfigOptions =
    typeof pathOrOptions === "string" ? { path: pathOrOptions } : (pathOrOptions ?? {});
  let overrides: Partial<AcmConfig> = {};

  if (opts.path) {
    let raw: string;
    try {
      raw = readFileSync(opts.path, "utf-8");
    } catch (err) {
      throw new Error(
        `Cannot read config file "${opts.path}": ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
    }
    try {
      overrides = JSON.parse(raw) as Partial<AcmConfig>;
    } catch (err) {
      throw new Error(
        `Invalid JSON in config file "${opts.path}": ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
    }

    const unknownKeys = Object.keys(overrides).filter((k) => !KNOWN_CONFIG_KEYS.has(k));
    if (unknownKeys.length > 0) {
      throw new Error(
        `Unknown config keys: ${unknownKeys.join(", ")}. Valid keys: ${[...KNOWN_CONFIG_KEYS].join(", ")}`
      );
    }
  }

  const dbPath = (opts.dbPathOverride || undefined) ?? overrides.db_path ?? DEFAULT_CONFIG.db_path;

  const config: AcmConfig = {
    ...DEFAULT_CONFIG,
    ...overrides,
    db_path: expandTilde(dbPath),
    // Normalize empty verbosity string to default; non-string values pass through to validate()
    verbosity:
      (overrides.verbosity as string) === ""
        ? DEFAULT_CONFIG.verbosity
        : (overrides.verbosity ?? DEFAULT_CONFIG.verbosity),
    ollama_url: overrides.ollama_url || undefined,
    ollama_model: overrides.ollama_model || undefined,
  };

  validate(config);
  return config;
}
