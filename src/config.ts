import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AcmConfig, ACM_MODES, DEFAULT_CONFIG } from "./store/types.js";

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
    const raw = readFileSync(path, "utf-8");
    overrides = JSON.parse(raw) as Partial<AcmConfig>;
  }

  const config: AcmConfig = {
    ...DEFAULT_CONFIG,
    ...overrides,
    db_path: expandTilde(overrides.db_path ?? DEFAULT_CONFIG.db_path),
  };

  validate(config);
  return config;
}
