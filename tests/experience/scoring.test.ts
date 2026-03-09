/**
 * Signal strength scoring tests — SPECIFICATION.md Section 2.2
 */

import { describe, it, expect } from "vitest";
import {
  computeFailureStrength,
  computeSuccessStrength,
  computeCorrectiveStrength,
} from "../../src/experience/scoring.js";
import { makeSummary } from "./helpers.js";

describe("computeFailureStrength", () => {
  it("returns 0.90–1.00 for interrupt + post-interrupt dialogue", () => {
    const summary = makeSummary({
      was_interrupted: true,
      counts: {
        ...makeSummary().counts,
        interrupt: 1,
        post_interrupt_turn: 3,
      },
    });
    const score = computeFailureStrength(summary, 5);
    expect(score).toBeGreaterThanOrEqual(0.9);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it("scales with post_interrupt_turn count within 0.90–1.00", () => {
    const low = computeFailureStrength(
      makeSummary({
        was_interrupted: true,
        counts: { ...makeSummary().counts, interrupt: 1, post_interrupt_turn: 0 },
      }),
      5
    );
    const high = computeFailureStrength(
      makeSummary({
        was_interrupted: true,
        counts: { ...makeSummary().counts, interrupt: 1, post_interrupt_turn: 5 },
      }),
      5
    );
    expect(low).toBe(0.9);
    expect(high).toBe(1.0);
    expect(high).toBeGreaterThan(low);
  });

  it("returns 0.60–0.80 for corrective instruction count >= 3", () => {
    const summary = makeSummary({
      corrective_instruction_count: 3,
    });
    const score = computeFailureStrength(summary, 5);
    expect(score).toBeGreaterThanOrEqual(0.6);
    expect(score).toBeLessThanOrEqual(0.8);
  });

  it("scales corrective (3+) with count", () => {
    const score3 = computeFailureStrength(makeSummary({ corrective_instruction_count: 3 }), 5);
    const score7 = computeFailureStrength(makeSummary({ corrective_instruction_count: 7 }), 5);
    expect(score3).toBe(0.6);
    expect(score7).toBeLessThanOrEqual(0.8);
    expect(score7).toBeGreaterThan(score3);
  });

  it("returns 0.30–0.50 for corrective instruction count 1-2", () => {
    const score1 = computeFailureStrength(makeSummary({ corrective_instruction_count: 1 }), 5);
    const score2 = computeFailureStrength(makeSummary({ corrective_instruction_count: 2 }), 5);
    expect(score1).toBeGreaterThanOrEqual(0.3);
    expect(score1).toBeLessThanOrEqual(0.5);
    expect(score2).toBeGreaterThanOrEqual(0.3);
    expect(score2).toBeLessThanOrEqual(0.5);
    expect(score2).toBeGreaterThan(score1);
  });

  it("returns null when no failure signals", () => {
    const summary = makeSummary({
      was_interrupted: false,
      corrective_instruction_count: 0,
    });
    const score = computeFailureStrength(summary, 5);
    expect(score).toBeNull();
  });

  it("prioritizes interrupt over corrective instructions", () => {
    const summary = makeSummary({
      was_interrupted: true,
      corrective_instruction_count: 5,
      counts: { ...makeSummary().counts, interrupt: 1, post_interrupt_turn: 3 },
    });
    const score = computeFailureStrength(summary, 5);
    expect(score).toBeGreaterThanOrEqual(0.9);
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
    expect(highRatio).toBeGreaterThan(lowRatio);
  });

  it("returns null when interrupted (not a success)", () => {
    const summary = makeSummary({
      was_interrupted: true,
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

describe("computeCorrectiveStrength", () => {
  it("returns null for count 0", () => {
    expect(computeCorrectiveStrength(0)).toBeNull();
  });

  it("returns null for count 1", () => {
    expect(computeCorrectiveStrength(1)).toBeNull();
  });

  it("returns null for count 2", () => {
    expect(computeCorrectiveStrength(2)).toBeNull();
  });

  it("returns 0.6 for count 3 (lower bound)", () => {
    expect(computeCorrectiveStrength(3)).toBe(0.6);
  });

  it("scales with count above 3", () => {
    const score5 = computeCorrectiveStrength(5);
    const score3 = computeCorrectiveStrength(3);
    expect(score5).toBeGreaterThan(score3!);
    expect(score5).toBeLessThanOrEqual(0.8);
  });

  it("caps at 0.8 for high counts", () => {
    expect(computeCorrectiveStrength(100)).toBe(0.8);
  });
});
