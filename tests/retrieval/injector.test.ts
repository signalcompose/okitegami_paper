import { describe, it, expect } from "vitest";
import { formatInjection, formatSignalInstruction } from "../../src/retrieval/injector.js";
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

  it("formats success entry correctly", () => {
    const result = formatInjection([makeResult()]);
    expect(result).toContain("[ACM Context]");
    expect(result).toContain("Past relevant experience:");
    expect(result).toContain(
      "SUCCESS: Fix authentication bug → Modified auth.ts to handle null tokens (strength: 0.72)"
    );
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
      'FAILURE: Fix authentication bug → Modified auth.ts to handle null tokens, user feedback: "Wrong file was edited" (strength: 0.85)'
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
    expect(result).toContain(
      "FAILURE: Fix authentication bug → Modified auth.ts to handle null tokens (strength: 0.63)"
    );
  });

  it("includes [ACM Context] header", () => {
    const result = formatInjection([makeResult()]);
    expect(result.startsWith("[ACM Context]")).toBe(true);
  });

  it("includes Details line per entry", () => {
    const result = formatInjection([makeResult({ id: "abc-123" })]);
    expect(result).toContain("Details: ~/.acm/experiences/abc-123.json");
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

describe("formatSignalInstruction", () => {
  it("includes ACM Signal Detection header", () => {
    const text = formatSignalInstruction("session-123");
    expect(text).toContain("[ACM Signal Detection]");
  });

  it("includes session ID in instruction", () => {
    const text = formatSignalInstruction("session-abc");
    expect(text).toContain("Session: session-abc");
    expect(text).toContain('"session-abc"');
  });

  it("instructs to call acm_record_signal", () => {
    const text = formatSignalInstruction("s1");
    expect(text).toContain("acm_record_signal");
    expect(text).toContain("corrective_instruction");
  });
});
