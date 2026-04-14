/**
 * Tests for verbosity-aware systemMessage formatting (Issue #88)
 */
import { describe, it, expect } from "vitest";
import {
  formatInjectionMessage,
  formatSessionEndMessage,
} from "../../src/hooks/verbosity-formatter.js";
import type { RetrievalResult } from "../../src/retrieval/types.js";
import type { ExperienceEntry } from "../../src/store/types.js";

function makeResult(overrides: Partial<ExperienceEntry> = {}, similarity = 0.85): RetrievalResult {
  const entry: ExperienceEntry = {
    id: "test-id",
    type: "failure",
    trigger: "テスト未実行でコミット",
    action: "git commit without tests",
    outcome: "Received 3 corrective instructions",
    retrieval_keys: ["test", "commit"],
    signal_strength: 0.72,
    signal_type: "corrective_instruction",
    session_id: "s1",
    timestamp: "2026-01-01T00:00:00Z",
    project: "okitegami_paper",
    ...overrides,
  };
  return { entry, similarity, score: similarity * entry.signal_strength };
}

describe("formatInjectionMessage", () => {
  describe("quiet", () => {
    it("shows only count when results exist", () => {
      const results = [makeResult(), makeResult({ id: "id2", type: "success" })];
      const msg = formatInjectionMessage(results, "quiet");
      expect(msg).toBe("[ACM] 2 experiences injected");
    });

    it("returns empty string when no results", () => {
      const msg = formatInjectionMessage([], "quiet");
      expect(msg).toBe("");
    });
  });

  describe("normal", () => {
    it("shows count, project, and entry details", () => {
      const results = [
        makeResult({ type: "failure", trigger: "テスト未実行でコミット", signal_strength: 0.72 }),
        makeResult({
          id: "id2",
          type: "success",
          trigger: "TDD で Red→Green→Refactor",
          signal_strength: 0.58,
          project: "okitegami_paper",
        }),
      ];
      const msg = formatInjectionMessage(results, "normal");
      expect(msg).toContain("[ACM] === Experience Injection ===");
      expect(msg).toContain("[ACM] 2 experiences injected from okitegami_paper");
      expect(msg).toContain('failure: "テスト未実行でコミット"');
      expect(msg).toContain('success: "TDD で Red→Green→Refactor"');
      expect(msg).toContain("[ACM] ==============================");
    });

    it("returns empty string when no results", () => {
      const msg = formatInjectionMessage([], "normal");
      expect(msg).toBe("");
    });

    it("shows mixed projects", () => {
      const results = [
        makeResult({ project: "projectA" }),
        makeResult({ id: "id2", project: "projectB" }),
      ];
      const msg = formatInjectionMessage(results, "normal");
      expect(msg).toContain("projectA, projectB");
    });
  });

  describe("verbose", () => {
    it("includes retrieval scores", () => {
      const results = [makeResult({}, 0.92)];
      const msg = formatInjectionMessage(results, "verbose");
      expect(msg).toContain("similarity:");
      expect(msg).toContain("score:");
    });
  });

  it("handles entries with no project gracefully", () => {
    const results = [makeResult({ project: undefined })];
    const msg = formatInjectionMessage(results, "normal");
    expect(msg).toContain("[ACM] 1 experiences injected");
    expect(msg).not.toContain("from ");
  });
});

describe("formatSessionEndMessage", () => {
  describe("quiet", () => {
    it("shows corrective count only", () => {
      const msg = formatSessionEndMessage(
        { corrective_count: 2, entries_generated: 3, entries_persisted: 3 },
        "quiet"
      );
      expect(msg).toBe("[ACM] 2 correctives detected, 3 experiences generated");
    });

    it("returns empty when nothing happened", () => {
      const msg = formatSessionEndMessage(
        { corrective_count: 0, entries_generated: 0, entries_persisted: 0 },
        "quiet"
      );
      expect(msg).toBe("");
    });
  });

  describe("normal", () => {
    it("shows corrective details and experience summary", () => {
      const msg = formatSessionEndMessage(
        {
          corrective_count: 2,
          entries_generated: 3,
          entries_persisted: 2,
          corrective_details: [
            { prompt: "テストを先に書いて", method: "llm" },
            { prompt: "型が間違っている", method: "structural" },
          ],
        },
        "normal"
      );
      expect(msg).toContain("[ACM] === Session Summary ===");
      expect(msg).toContain("[ACM] 2 corrective instructions detected");
      expect(msg).toContain("テストを先に書いて");
      expect(msg).toContain("[ACM] 3 experiences generated, 2 persisted");
      expect(msg).toContain("[ACM] ==============================");
      // method/confidence omitted at normal level
      expect(msg).not.toContain("method:");
      expect(msg).not.toContain("confidence:");
    });

    it("shows corrective details even when no entries generated", () => {
      const msg = formatSessionEndMessage(
        {
          corrective_count: 1,
          entries_generated: 0,
          entries_persisted: 0,
          corrective_details: [{ prompt: "fix this", method: "llm" }],
        },
        "normal"
      );
      expect(msg).toContain("[ACM] === Session Summary ===");
      expect(msg).toContain("fix this");
      expect(msg).not.toContain("experiences generated");
    });
  });

  describe("verbose", () => {
    it("includes method details for correctives", () => {
      const msg = formatSessionEndMessage(
        {
          corrective_count: 1,
          entries_generated: 1,
          entries_persisted: 1,
          corrective_details: [{ prompt: "fix this", method: "llm", confidence: 0.95 }],
        },
        "verbose"
      );
      expect(msg).toContain("method: llm");
      expect(msg).toContain("confidence: 0.95");
    });
  });
});
