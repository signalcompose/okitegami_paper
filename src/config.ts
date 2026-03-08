import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { AcmConfig, AcmMode, DEFAULT_CONFIG } from "./store/types.js";

const VALID_MODES: AcmMode[] = [
  "disabled",
  "success_only",
  "failure_only",
  "full",
];

function expandTilde(filePath: string): string {
  if (filePath === "~") {
    return homedir();
  }
  if (filePath.startsWith("~/")) {
    return filePath.replace("~/", homedir() + "/");
  }
  return filePath;
}

function validate(config: AcmConfig): void {
  if (!VALID_MODES.includes(config.mode)) {
    throw new Error(
      `Invalid mode "${config.mode}". Must be one of: ${VALID_MODES.join(", ")}`
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
