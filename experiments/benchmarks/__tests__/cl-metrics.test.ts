/**
 * Tests for CL (Continual Learning) Metrics — Issue #106 (#95-A)
 *
 * Pure function tests based on SWE-Bench-CL (arXiv:2507.00014) Section 7 metrics.
 * No mocks needed — all functions are pure.
 */
import { describe, it, expect } from "vitest";
import {
  computeForwardTransfer,
  computeForgetting,
  computeCLFbeta,
  computeCLScore,
  computeAllCLMetrics,
} from "../cl-metrics.js";

// --- computeForwardTransfer ---
// FT = (1/(N-1)) * Σ_{i=0}^{N-2} (a[i][i+1] - baseline[i+1])
// Uses superdiagonal: after training on task i, performance on task i+1

describe("computeForwardTransfer", () => {
  it("returns positive value when ACM transfers to next task better than baseline", () => {
    // sessions[0][1] = 0.7 (task 0 trained, eval task 1) vs baseline[1] = 0.4
    // sessions[1][2] = 0.8 (task 1 trained, eval task 2) vs baseline[2] = 0.3
    // FWT = ((0.7-0.4) + (0.8-0.3)) / 2 = (0.3 + 0.5) / 2 = 0.4
    const sessions = [
      [0.8, 0.7, 0.6],
      [0.0, 0.9, 0.8],
      [0.0, 0.0, 0.7],
    ];
    const baseline = [0.5, 0.4, 0.3];
    expect(computeForwardTransfer(sessions, baseline)).toBeCloseTo(0.4, 4);
  });

  it("returns 0 when superdiagonal equals baseline", () => {
    const sessions = [
      [0.8, 0.6], // a[0][1] = 0.6 == baseline[1]
      [0.0, 0.9],
    ];
    const baseline = [0.5, 0.6];
    expect(computeForwardTransfer(sessions, baseline)).toBeCloseTo(0, 4);
  });

  it("returns negative when baseline outperforms superdiagonal", () => {
    const sessions = [
      [0.8, 0.3], // a[0][1] = 0.3 < baseline[1] = 0.6
      [0.0, 0.7],
    ];
    const baseline = [0.5, 0.6];
    expect(computeForwardTransfer(sessions, baseline)).toBeCloseTo(-0.3, 4);
  });

  it("returns 0 for empty sessions", () => {
    expect(computeForwardTransfer([], [])).toBe(0);
  });

  it("returns 0 for N=1 (no transfer possible)", () => {
    expect(computeForwardTransfer([[0.8]], [0.5])).toBe(0);
  });
});

// --- computeForgetting ---
// F = (1/(N-1)) * Σ_{j=0}^{N-2} (max(a[j][*]) - a[j][T])
// Excludes last task; uses N-1 as denominator

describe("computeForgetting", () => {
  it("returns 0 for monotonically increasing sessions", () => {
    const sessions = [
      [0.5, 0.6, 0.7], // task 0: never drops → forgetting = 0
      [0.0, 0.4, 0.5], // task 1: never drops → forgetting = 0
      [0.0, 0.0, 0.8], // task 2: excluded (last task)
    ];
    expect(computeForgetting(sessions)).toBeCloseTo(0, 4);
  });

  it("returns positive value for performance drops", () => {
    // Task 0: peak 0.8, last 0.5 → forgetting = 0.3
    // Task 1: peak 0.7, last 0.7 → forgetting = 0.0
    // Task 2: excluded (last task)
    // Mean = (0.3 + 0.0) / 2 = 0.15
    const sessions = [
      [0.6, 0.8, 0.5],
      [0.0, 0.7, 0.7],
      [0.0, 0.0, 0.9],
    ];
    expect(computeForgetting(sessions)).toBeCloseTo(0.15, 4);
  });

  it("returns 0 for single session (no forgetting possible)", () => {
    const sessions = [[0.5], [0.7]];
    expect(computeForgetting(sessions)).toBe(0);
  });

  it("returns 0 for empty sessions", () => {
    expect(computeForgetting([])).toBe(0);
  });

  it("returns 0 for N=1 (no tasks to forget)", () => {
    const sessions = [[0.9, 0.7, 0.6]];
    expect(computeForgetting(sessions)).toBe(0);
  });

  it("handles constant performance (no forgetting)", () => {
    const sessions = [
      [0.5, 0.5, 0.5],
      [0.7, 0.7, 0.7],
      [0.0, 0.0, 0.8],
    ];
    expect(computeForgetting(sessions)).toBeCloseTo(0, 4);
  });

  it("computes correctly with two tasks", () => {
    // Task 0: peak 0.9, last 0.6 → forgetting = 0.3
    // Task 1: excluded (last task)
    // Mean = 0.3 / 1 = 0.3
    const sessions = [
      [0.9, 0.6],
      [0.0, 0.8],
    ];
    expect(computeForgetting(sessions)).toBeCloseTo(0.3, 4);
  });
});

// --- computeCLFbeta ---

describe("computeCLFbeta", () => {
  it("computes harmonic mean of plasticity and stability", () => {
    const sessions = [
      [0.8, 0.7],
      [0.0, 0.9],
    ];
    const baseline = [0.5, 0.6];
    const result = computeCLFbeta(sessions, baseline);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it("returns 0 when plasticity is 0", () => {
    const sessions = [
      [0.0, 0.5],
      [0.0, 0.0],
    ];
    const baseline = [0.5, 0.5];
    expect(computeCLFbeta(sessions, baseline)).toBe(0);
  });

  it("returns 0 when stability is 0 (complete forgetting)", () => {
    // Task 0: peak 1.0, drops to 0.0 → forgetting = 1.0
    // Task 1: excluded (last task)
    // stability = 1 - 1.0 = 0
    const sessions = [
      [1.0, 0.0],
      [0.0, 0.5],
    ];
    const baseline = [0.5, 0.5];
    expect(computeCLFbeta(sessions, baseline)).toBe(0);
  });

  it("uses default beta=1 (equal weight)", () => {
    const sessions = [
      [0.8, 0.7],
      [0.0, 0.9],
    ];
    const baseline = [0.5, 0.6];
    const defaultResult = computeCLFbeta(sessions, baseline);
    const beta1Result = computeCLFbeta(sessions, baseline, 1);
    expect(defaultResult).toBeCloseTo(beta1Result, 10);
  });

  it("accepts custom beta parameter", () => {
    const sessions = [
      [0.8, 0.7],
      [0.0, 0.9],
    ];
    const baseline = [0.5, 0.6];
    const beta1 = computeCLFbeta(sessions, baseline, 1);
    const beta2 = computeCLFbeta(sessions, baseline, 2);
    expect(beta1).not.toBeCloseTo(beta2, 4);
  });

  it("returns 0 for empty sessions", () => {
    expect(computeCLFbeta([], [])).toBe(0);
  });
});

// --- computeCLScore ---
// CL-Score = ACC + FWT - Forgetting
// ACC = mean of last row (final accuracy after all training)

describe("computeCLScore", () => {
  it("computes composite score from ACC, FWT, and forgetting", () => {
    const sessions = [
      [0.8, 0.7],
      [0.0, 0.9],
    ];
    const baseline = [0.5, 0.6];
    const score = computeCLScore(sessions, baseline);
    expect(typeof score).toBe("number");

    // ACC = mean of last row = (0.0 + 0.9) / 2 = 0.45
    // FWT = (a[0][1] - baseline[1]) / 1 = (0.7 - 0.6) / 1 = 0.1
    // Forgetting: task 0 only (last excluded): max(0.8,0.7) - 0.7 = 0.1, mean = 0.1/1 = 0.1
    // CL-Score = 0.45 + 0.1 - 0.1 = 0.45
    expect(score).toBeCloseTo(0.45, 4);
  });

  it("is higher when ACM outperforms baseline in transfer", () => {
    const sessions = [
      [0.9, 0.9],
      [0.0, 0.9],
    ];
    const baselineLow = [0.3, 0.3];
    const baselineHigh = [0.8, 0.8];
    const scoreLow = computeCLScore(sessions, baselineLow);
    const scoreHigh = computeCLScore(sessions, baselineHigh);
    expect(scoreLow).toBeGreaterThan(scoreHigh);
  });

  it("returns 0 for empty sessions", () => {
    expect(computeCLScore([], [])).toBe(0);
  });
});

// --- computeAllCLMetrics ---

describe("computeAllCLMetrics", () => {
  it("returns all metric fields", () => {
    const acm = [
      [0.8, 0.7],
      [0.0, 0.9],
    ];
    const baseline = [0.5, 0.6];
    const result = computeAllCLMetrics(acm, baseline);

    expect(result).toHaveProperty("forward_transfer");
    expect(result).toHaveProperty("forgetting");
    expect(result).toHaveProperty("cl_f_beta");
    expect(result).toHaveProperty("cl_score");
    expect(result).toHaveProperty("plasticity");
    expect(result).toHaveProperty("stability");
  });

  it("computes consistent values across individual functions", () => {
    const acm = [
      [0.8, 0.7],
      [0.0, 0.9],
    ];
    const baseline = [0.5, 0.6];
    const result = computeAllCLMetrics(acm, baseline);

    // stability = 1 - forgetting
    expect(result.stability).toBeCloseTo(1 - result.forgetting, 10);

    // forward_transfer matches standalone
    expect(result.forward_transfer).toBeCloseTo(computeForwardTransfer(acm, baseline), 10);

    // forgetting matches standalone
    expect(result.forgetting).toBeCloseTo(computeForgetting(acm), 10);

    // cl_f_beta matches standalone
    expect(result.cl_f_beta).toBeCloseTo(computeCLFbeta(acm, baseline), 10);
  });

  it("handles perfect scenario (no forgetting, high performance)", () => {
    const acm = [
      [1.0, 1.0],
      [0.0, 1.0],
    ];
    const baseline = [0.5, 0.5];
    const result = computeAllCLMetrics(acm, baseline);

    expect(result.forgetting).toBe(0);
    expect(result.stability).toBe(1);
    expect(result.plasticity).toBeCloseTo(1.0, 4);
    // FWT = (a[0][1] - baseline[1]) / 1 = (1.0 - 0.5) / 1 = 0.5
    expect(result.forward_transfer).toBeCloseTo(0.5, 4);
  });

  it("handles 3x3 matrix with mixed performance", () => {
    const acm = [
      [0.9, 0.8, 0.6], // task 0: peaks at 0.9, drops to 0.6
      [0.0, 0.7, 0.7], // task 1: stable at 0.7
      [0.0, 0.0, 0.8], // task 2: introduced last
    ];
    const baseline = [0.4, 0.3, 0.3];
    const result = computeAllCLMetrics(acm, baseline);

    // Plasticity = mean diagonal = (0.9 + 0.7 + 0.8) / 3 = 0.8
    expect(result.plasticity).toBeCloseTo(0.8, 4);

    // Forgetting (exclude task 2):
    // task 0: max=0.9, last=0.6, f=0.3
    // task 1: max=0.7, last=0.7, f=0.0
    // mean = 0.3 / 2 = 0.15
    expect(result.forgetting).toBeCloseTo(0.15, 4);

    // FWT: (a[0][1]-baseline[1] + a[1][2]-baseline[2]) / 2
    // = (0.8-0.3 + 0.7-0.3) / 2 = (0.5 + 0.4) / 2 = 0.45
    expect(result.forward_transfer).toBeCloseTo(0.45, 4);
  });
});
