/**
 * Signal strength scoring tests — SPECIFICATION.md Section 2.2
 *
 * Revised: Interrupt alone is ambiguous (null).
 * Corrective instruction count is the primary failure signal.
 * Interrupt acts as a strength modifier (+0.10).
 */

import { describe, it, expect } from "vitest";
import { computeFailureStrength, computeSuccessStrength } from "../../src/experience/scoring.js";
import { makeSummary } from "./helpers.js";

describe("computeFailureStrength", () => {
  it("returns null for interrupt + 0 corrective (ambiguous)", () => {
    const summary = makeSummary({
      was_interrupted: true,
      corrective_instruction_count: 0,
      counts: {
        ...makeSummary().counts,
        interrupt: 1,
        post_interrupt_turn: 3,
      },
    });
    const score = computeFailureStrength(summary);
    expect(score).toBeNull();
  });

  it("returns 0.40–0.60 for interrupt + 1-2 corrective", () => {
    const summary = makeSummary({
      was_interrupted: true,
      corrective_instruction_count: 2,
      counts: { ...makeSummary().counts, interrupt: 1 },
    });
    const score = computeFailureStrength(summary);
    expect(score).toBeGreaterThanOrEqual(0.4);
    expect(score).toBeLessThanOrEqual(0.6);
  });

  it("returns 0.70–0.90 for interrupt + 3+ corrective", () => {
    const summary = makeSummary({
      was_interrupted: true,
      corrective_instruction_count: 3,
      counts: { ...makeSummary().counts, interrupt: 1 },
    });
    const score = computeFailureStrength(summary);
    expect(score).toBeGreaterThanOrEqual(0.7);
    expect(score).toBeLessThanOrEqual(0.9);
  });

  it("returns 0.60–0.80 for no interrupt + corrective count >= 3", () => {
    const summary = makeSummary({
      was_interrupted: false,
      corrective_instruction_count: 3,
    });
    const score = computeFailureStrength(summary);
    expect(score).toBeGreaterThanOrEqual(0.6);
    expect(score).toBeLessThanOrEqual(0.8);
  });

  it("scales corrective (3+) with count", () => {
    const score3 = computeFailureStrength(makeSummary({ corrective_instruction_count: 3 }));
    const score7 = computeFailureStrength(makeSummary({ corrective_instruction_count: 7 }));
    expect(score3).toBe(0.6);
    expect(score7).toBeLessThanOrEqual(0.9);
    expect(score7).toBeGreaterThan(score3!);
  });

  it("returns 0.30–0.50 for corrective instruction count 1-2 (no interrupt)", () => {
    const score1 = computeFailureStrength(makeSummary({ corrective_instruction_count: 1 }));
    const score2 = computeFailureStrength(makeSummary({ corrective_instruction_count: 2 }));
    expect(score1).toBeGreaterThanOrEqual(0.3);
    expect(score1).toBeLessThanOrEqual(0.5);
    expect(score2).toBeGreaterThanOrEqual(0.3);
    expect(score2).toBeLessThanOrEqual(0.5);
    expect(score2).toBeGreaterThan(score1!);
  });

  it("returns null when no failure signals", () => {
    const summary = makeSummary({
      was_interrupted: false,
      corrective_instruction_count: 0,
    });
    const score = computeFailureStrength(summary);
    expect(score).toBeNull();
  });

  it("interrupt boosts corrective strength by 0.10", () => {
    const withoutInterrupt = computeFailureStrength(
      makeSummary({ corrective_instruction_count: 2, was_interrupted: false })
    );
    const withInterrupt = computeFailureStrength(
      makeSummary({ corrective_instruction_count: 2, was_interrupted: true })
    );
    expect(withInterrupt! - withoutInterrupt!).toBeCloseTo(0.1, 2);
  });
});

describe("computeSuccessStrength", () => {
  it("returns 0.70–0.85 for test pass + uninterrupted", () => {
    const summary = makeSummary({
      has_test_pass: true,
      was_interrupted: false,
      counts: {
        ...makeSummary().counts,
        tool_success: 5,
      },
    });
    const score = computeSuccessStrength(summary, 10);
    expect(score).toBeGreaterThanOrEqual(0.7);
    expect(score).toBeLessThanOrEqual(0.85);
  });

  it("returns 0.40–0.60 for uninterrupted without tests", () => {
    const summary = makeSummary({
      has_test_pass: false,
      was_interrupted: false,
      counts: {
        ...makeSummary().counts,
        tool_success: 3,
      },
    });
    const score = computeSuccessStrength(summary, 10);
    expect(score).toBeGreaterThanOrEqual(0.4);
    expect(score).toBeLessThanOrEqual(0.6);
  });

  it("scales with tool success ratio", () => {
    const lowRatio = computeSuccessStrength(
      makeSummary({
        has_test_pass: true,
        counts: { ...makeSummary().counts, tool_success: 0 },
      }),
      10
    );
    const highRatio = computeSuccessStrength(
      makeSummary({
        has_test_pass: true,
        counts: { ...makeSummary().counts, tool_success: 10 },
      }),
      10
    );
    expect(highRatio).toBeGreaterThan(lowRatio!);
  });

  it("returns null for interrupt + 0 corrective (ambiguous)", () => {
    const summary = makeSummary({
      was_interrupted: true,
      corrective_instruction_count: 0,
      has_test_pass: true,
    });
    const score = computeSuccessStrength(summary, 10);
    expect(score).toBeNull();
  });

  it("returns null when corrective count >= 3 (not a clean success)", () => {
    const summary = makeSummary({
      corrective_instruction_count: 3,
      has_test_pass: true,
    });
    const score = computeSuccessStrength(summary, 10);
    expect(score).toBeNull();
  });

  it("handles zero total signals gracefully", () => {
    const summary = makeSummary({
      has_test_pass: false,
      total_signals: 0,
    });
    const score = computeSuccessStrength(summary, 0);
    expect(score).toBeGreaterThanOrEqual(0.4);
    expect(score).toBeLessThanOrEqual(0.6);
  });
});
