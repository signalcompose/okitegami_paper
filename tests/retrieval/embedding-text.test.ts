import { describe, it, expect } from "vitest";
import { buildEmbeddingText } from "../../src/retrieval/embedding-text.js";
import type { ExperienceEntry } from "../../src/store/types.js";

function makeEntry(overrides: Partial<ExperienceEntry> = {}): ExperienceEntry {
  return {
    id: "test-id",
    type: "success",
    trigger: "Fix login bug",
    action: "Edited auth.ts",
    outcome: "Tests passed",
    retrieval_keys: ["auth", "login", "bug"],
    signal_strength: 0.7,
    signal_type: "uninterrupted_completion",
    session_id: "session-1",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("buildEmbeddingText", () => {
  it("combines trigger and retrieval_keys with spaces", () => {
    const entry = makeEntry({
      trigger: "Fix login bug",
      retrieval_keys: ["auth", "login", "bug"],
    });
    expect(buildEmbeddingText(entry)).toBe("Fix login bug auth login bug");
  });

  it("returns trigger only when retrieval_keys is empty", () => {
    const entry = makeEntry({
      trigger: "Refactor module",
      retrieval_keys: [],
    });
    expect(buildEmbeddingText(entry)).toBe("Refactor module");
  });

  it("handles single retrieval key", () => {
    const entry = makeEntry({
      trigger: "Add feature",
      retrieval_keys: ["feature"],
    });
    expect(buildEmbeddingText(entry)).toBe("Add feature feature");
  });

  it("preserves case in trigger and keys", () => {
    const entry = makeEntry({
      trigger: "Fix AuthService",
      retrieval_keys: ["AuthService", "TokenRefresh"],
    });
    expect(buildEmbeddingText(entry)).toBe("Fix AuthService AuthService TokenRefresh");
  });
});
