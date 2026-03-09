/**
 * Shared test helpers for retrieval and store tests
 */
import type { ExperienceEntry, AcmConfig } from "../../src/store/types.js";
import { DEFAULT_CONFIG } from "../../src/store/types.js";

export function makeEntry(
  overrides: Partial<ExperienceEntry> = {}
): Omit<ExperienceEntry, "id"> {
  return {
    type: "success",
    trigger: "Fix bug in auth module",
    action: "Modified auth.ts to handle null tokens",
    outcome: "Tests pass, no regressions",
    retrieval_keys: ["auth", "null-token", "bug-fix"],
    signal_strength: 0.75,
    signal_type: "uninterrupted_completion",
    session_id: "session-001",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

export function makeConfig(overrides: Partial<AcmConfig> = {}): AcmConfig {
  return { ...DEFAULT_CONFIG, db_path: ":memory:", ...overrides };
}
