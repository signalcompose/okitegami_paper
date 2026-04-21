import { describe, it, expect } from "vitest";
import { formatInjection, bodiesInlinedFor } from "../../src/retrieval/injector.js";
import type { RetrievalResult } from "../../src/retrieval/types.js";
import type { ExperienceEntry } from "../../src/store/types.js";

function makeResult(
  overrides: Partial<ExperienceEntry> & { similarity?: number; score?: number } = {}
): RetrievalResult {
  const { similarity = 0.9, score = 0.72, ...entryOverrides } = overrides;
  return {
    entry: {
      id: "test-id",
      type: "success",
      trigger: "Fix authentication bug",
      action: "Modified auth.ts to handle null tokens",
      outcome: "Tests pass",
      retrieval_keys: ["auth", "bug-fix"],
      signal_strength: 0.8,
      signal_type: "uninterrupted_completion",
      session_id: "session-001",
      timestamp: "2026-01-01T00:00:00Z",
      ...entryOverrides,
    },
    similarity,
    score,
  };
}

describe("formatInjection", () => {
  it("returns empty string for empty array", () => {
    expect(formatInjection([])).toBe("");
  });

  it("formats success entry with outcome", () => {
    const result = formatInjection([makeResult()]);
    expect(result).toContain("[ACM Context]");
    expect(result).toContain("Past relevant experience:");
    expect(result).toContain("SUCCESS: Fix authentication bug → Tests pass (strength: 0.72)");
  });

  it("formats failure entry with dialogue summary", () => {
    const result = formatInjection([
      makeResult({
        type: "failure",
        signal_type: "interrupt_with_dialogue",
        signal_strength: 0.95,
        interrupt_context: {
          turns_captured: 3,
          dialogue_summary: "Wrong file was edited",
        },
        score: 0.85,
      }),
    ]);
    expect(result).toContain(
      'FAILURE: Fix authentication bug → Tests pass, user feedback: "Wrong file was edited" (strength: 0.85)'
    );
  });

  it("formats failure entry without dialogue summary", () => {
    const result = formatInjection([
      makeResult({
        type: "failure",
        signal_type: "corrective_instruction",
        signal_strength: 0.7,
        score: 0.63,
      }),
    ]);
    expect(result).toContain("FAILURE: Fix authentication bug → Tests pass (strength: 0.63)");
  });

  it("includes [ACM Context] header", () => {
    const result = formatInjection([makeResult()]);
    expect(result.startsWith("[ACM Context]")).toBe(true);
  });

  it("does not include dead file path references", () => {
    const result = formatInjection([makeResult({ id: "abc-123" })]);
    expect(result).not.toContain("Details:");
    expect(result).not.toContain("~/.acm/experiences/");
  });

  it("formats multiple entries", () => {
    const results = [
      makeResult({ score: 0.9 }),
      makeResult({
        type: "failure",
        signal_type: "interrupt_with_dialogue",
        signal_strength: 0.95,
        interrupt_context: {
          turns_captured: 3,
          dialogue_summary: "Wrong approach",
        },
        score: 0.8,
      }),
    ];
    const text = formatInjection(results);
    const lines = text.split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("SUCCESS:");
    expect(lines[1]).toContain("FAILURE:");
  });

  it("inlines corrective bodies when score meets threshold (#128)", () => {
    const result = formatInjection([
      makeResult({
        type: "failure",
        signal_type: "corrective_instruction",
        signal_strength: 0.8,
        corrective_bodies: [
          "ビルトインコマンドはそのまま使ったほうが良くない？",
          "setting.local.jsonで修正してもいい。",
        ],
        score: 1.2,
      }),
    ]);
    expect(result).toContain('    • "ビルトインコマンドはそのまま使ったほうが良くない？"');
    expect(result).toContain('    • "setting.local.jsonで修正してもいい。"');
  });

  it("omits corrective bodies when score is below threshold (#128)", () => {
    const result = formatInjection([
      makeResult({
        type: "failure",
        signal_type: "corrective_instruction",
        signal_strength: 0.4,
        corrective_bodies: ["some instruction"],
        score: 0.3,
      }),
    ]);
    expect(result).not.toContain('"some instruction"');
    expect(result).toContain("FAILURE:");
  });

  it("caps inlined bodies to MAX_INLINED_BODIES_PER_ENTRY (#128)", () => {
    const bodies = Array.from({ length: 10 }, (_, i) => `body-${i}`);
    const result = formatInjection([
      makeResult({
        type: "failure",
        signal_type: "corrective_instruction",
        signal_strength: 0.9,
        corrective_bodies: bodies,
        score: 1.5,
      }),
    ]);
    const matches = result.match(/• "body-\d+"/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(3);
  });

  it("honors injected policy threshold override (#130)", () => {
    const result = formatInjection(
      [
        makeResult({
          type: "failure",
          signal_type: "corrective_instruction",
          signal_strength: 0.5,
          corrective_bodies: ["low-score body"],
          score: 0.3,
        }),
      ],
      { correctiveBodiesScoreThreshold: 0.2, maxInlinedBodiesPerEntry: 3 }
    );
    expect(result).toContain('"low-score body"');
  });

  it("honors injected policy max override (#130)", () => {
    const bodies = ["a", "b", "c", "d", "e"];
    const result = formatInjection(
      [
        makeResult({
          type: "failure",
          signal_type: "corrective_instruction",
          signal_strength: 0.9,
          corrective_bodies: bodies,
          score: 1.5,
        }),
      ],
      { correctiveBodiesScoreThreshold: 0.6, maxInlinedBodiesPerEntry: 1 }
    );
    const matches = result.match(/•/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("bodiesInlinedFor returns true only when threshold met and bodies exist (#130)", () => {
    const failureWithBodies = makeResult({
      type: "failure",
      signal_type: "corrective_instruction",
      corrective_bodies: ["x"],
      score: 1.0,
    });
    const failureWithoutBodies = makeResult({
      type: "failure",
      signal_type: "corrective_instruction",
      score: 1.0,
    });
    const successResult = makeResult({ score: 1.0 });
    const policy = { correctiveBodiesScoreThreshold: 0.6, maxInlinedBodiesPerEntry: 3 };

    expect(bodiesInlinedFor(failureWithBodies.entry, failureWithBodies.score, policy)).toBe(true);
    expect(bodiesInlinedFor(failureWithoutBodies.entry, failureWithoutBodies.score, policy)).toBe(
      false
    );
    expect(bodiesInlinedFor(successResult.entry, successResult.score, policy)).toBe(false);
    expect(
      bodiesInlinedFor(failureWithBodies.entry, failureWithBodies.score, {
        ...policy,
        correctiveBodiesScoreThreshold: 2.0,
      })
    ).toBe(false);
  });

  it("respects budget when entries have inlined corrective bodies (#128)", () => {
    const bigBodies = Array.from({ length: 3 }, () => "X".repeat(200));
    const results: RetrievalResult[] = [];
    for (let i = 0; i < 20; i++) {
      results.push(
        makeResult({
          type: "failure",
          signal_type: "corrective_instruction",
          trigger: "T".repeat(50),
          outcome: "O".repeat(50),
          corrective_bodies: bigBodies,
          score: 1.2 - i * 0.01,
        })
      );
    }
    const text = formatInjection(results);
    expect(text.length).toBeLessThanOrEqual(2000);
  });

  it("truncates to 500 token budget (approx 2000 chars)", () => {
    const longResults: RetrievalResult[] = [];
    for (let i = 0; i < 20; i++) {
      longResults.push(
        makeResult({
          trigger: "A".repeat(100) + ` task ${i}`,
          action: "B".repeat(100) + ` action ${i}`,
          score: 0.9 - i * 0.01,
        })
      );
    }
    const text = formatInjection(longResults);
    // 500 tokens ≈ 2000 chars
    expect(text.length).toBeLessThanOrEqual(2000);
  });
});

// formatSignalInstruction removed in Issue #83 — corrective detection
// is now handled by transcript analysis at session-end.
