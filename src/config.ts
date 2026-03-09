import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AcmConfig, ACM_MODES, DEFAULT_CONFIG } from "./store/types.js";

const KNOWN_CONFIG_KEYS = new Set<string>([
  "mode",
  "top_k",
  "capture_turns",
  "promotion_threshold",
  "db_path",
]);

function expandTilde(filePath: string): string {
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
    throw new Error(
      `Invalid mode "${config.mode}". Must be one of: ${ACM_MODES.join(", ")}`
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
}

export function loadConfig(path?: string): AcmConfig {
  let overrides: Partial<AcmConfig> = {};

  if (path) {
    let raw: string;
    try {
      raw = readFileSync(path, "utf-8");
    } catch (err) {
      throw new Error(
        `Cannot read config file "${path}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
    try {
      overrides = JSON.parse(raw) as Partial<AcmConfig>;
    } catch (err) {
      throw new Error(
        `Invalid JSON in config file "${path}": ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const unknownKeys = Object.keys(overrides).filter(
      (k) => !KNOWN_CONFIG_KEYS.has(k)
    );
    if (unknownKeys.length > 0) {
      throw new Error(
        `Unknown config keys: ${unknownKeys.join(", ")}. Valid keys: ${[...KNOWN_CONFIG_KEYS].join(", ")}`
      );
    }
  }

  const config: AcmConfig = {
    ...DEFAULT_CONFIG,
    ...overrides,
    db_path: expandTilde(overrides.db_path ?? DEFAULT_CONFIG.db_path),
  };

  validate(config);
  return config;
}
