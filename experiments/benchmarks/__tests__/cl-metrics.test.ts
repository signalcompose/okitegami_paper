/**
 * Tests for CL (Continual Learning) Metrics — Issue #106 (#95-A)
 *
 * Pure function tests based on SWE-Bench-CL (arXiv:2507.00014) Section 7 metrics.
 * No mocks needed — all functions are pure.
 *
 * Matrix convention (paper): a[i][j] = performance on task j after training through task i.
 * Rows = training stage, Columns = evaluation task.
 */
import { describe, it, expect } from "vitest";
import {
  computeForwardTransfer,
  computeForgetting,
  computeCLFbeta,
  computeCLScore,
  computeAllCLMetrics,
} from "../cl-metrics.js";

// --- Input validation ---

describe("input validation", () => {
  it("throws RangeError for non-square matrix in computeForwardTransfer", () => {
    const a = [
      [0.8, 0.7, 0.6],
      [0.9, 0.9],
    ];
    expect(() => computeForwardTransfer(a, [0.5, 0.4, 0.3])).toThrow(RangeError);
  });

  it("throws RangeError for non-square matrix in computeForgetting", () => {
    const a = [
      [0.8, 0.7],
      [0.9, 0.9, 0.8],
    ];
    expect(() => computeForgetting(a)).toThrow(RangeError);
  });

  it("throws RangeError when baseline is shorter than matrix size", () => {
    const a = [
      [0.8, 0.7],
      [0.7, 0.9],
    ];
    expect(() => computeForwardTransfer(a, [0.5])).toThrow(RangeError);
  });

  it("throws RangeError for non-square matrix in computeAllCLMetrics", () => {
    const a = [
      [0.8, 0.7, 0.6],
      [0.9, 0.9],
    ];
    expect(() => computeAllCLMetrics(a, [0.5, 0.4, 0.3])).toThrow(RangeError);
  });

  it("throws RangeError when baseline is shorter in computeAllCLMetrics", () => {
    const a = [
      [0.8, 0.7],
      [0.7, 0.9],
    ];
    expect(() => computeAllCLMetrics(a, [0.5])).toThrow(RangeError);
  });

  it("throws RangeError for non-square matrix in computeCLFbeta", () => {
    const a = [
      [0.8, 0.7, 0.6],
      [0.9, 0.9],
    ];
    expect(() => computeCLFbeta(a)).toThrow(RangeError);
  });

  it("throws RangeError for matrix containing NaN", () => {
    const a = [
      [NaN, 0.7],
      [0.7, 0.9],
    ];
    expect(() => computeForwardTransfer(a, [0.5, 0.6])).toThrow(RangeError);
    expect(() => computeForgetting(a)).toThrow(RangeError);
    expect(() => computeCLFbeta(a)).toThrow(RangeError);
    expect(() => computeAllCLMetrics(a, [0.5, 0.6])).toThrow(RangeError);
  });

  it("throws RangeError for matrix containing Infinity", () => {
    const a = [
      [0.8, Infinity],
      [0.7, 0.9],
    ];
    expect(() => computeForgetting(a)).toThrow(RangeError);
  });
});

// --- computeForwardTransfer ---
// FT = (1/(N-1)) * Σ_{i=0}^{N-2} (a[i][i+1] - baseline[i+1])
// Superdiagonal: after training on task i, performance on task i+1

describe("computeForwardTransfer", () => {
  it("returns positive value when ACM transfers to next task better than baseline", () => {
    // a[0][1] = 0.7 (after training task 0, eval task 1) vs baseline[1] = 0.4
    // a[1][2] = 0.8 (after training task 1, eval task 2) vs baseline[2] = 0.3
    // FWT = ((0.7-0.4) + (0.8-0.3)) / 2 = 0.4
    const a = [
      [0.8, 0.7, 0.6], // trained through task 0
      [0.9, 0.9, 0.8], // trained through task 1
      [0.8, 0.8, 0.7], // trained through task 2
    ];
    const baseline = [0.5, 0.4, 0.3];
    expect(computeForwardTransfer(a, baseline)).toBeCloseTo(0.4, 4);
  });

  it("returns 0 when superdiagonal equals baseline", () => {
    const a = [
      [0.8, 0.6], // a[0][1] = 0.6 == baseline[1]
      [0.7, 0.9], // trained through task 1
    ];
    const baseline = [0.5, 0.6];
    expect(computeForwardTransfer(a, baseline)).toBeCloseTo(0, 4);
  });

  it("returns negative when baseline outperforms superdiagonal", () => {
    const a = [
      [0.8, 0.3], // a[0][1] = 0.3 < baseline[1] = 0.6
      [0.5, 0.7],
    ];
    const baseline = [0.5, 0.6];
    expect(computeForwardTransfer(a, baseline)).toBeCloseTo(-0.3, 4);
  });

  it("returns 0 for empty matrix", () => {
    expect(computeForwardTransfer([], [])).toBe(0);
  });

  it("returns 0 for N=1 (no transfer possible)", () => {
    expect(computeForwardTransfer([[0.8]], [0.5])).toBe(0);
  });
});

// --- computeForgetting ---
// F = (1/(N-1)) * Σ_{j=0}^{N-2} max(0, max_{k=0}^{j} a[k][j] - a[N-1][j])
// Reads columns, peak up to stage j. Excludes last eval task. N-1 denominator.

describe("computeForgetting", () => {
  it("returns 0 when final performance matches peak (no degradation)", () => {
    // Column 0 (task 0): max_{k=0}^{0}=0.5, final=0.7 → max(0, 0.5-0.7)=0
    // Column 1 (task 1): max_{k=0}^{1}=max(0.0,0.4)=0.4, final=0.5 → max(0, 0.4-0.5)=0
    // Column 2 excluded (last eval task)
    const a = [
      [0.5, 0.0, 0.0],
      [0.6, 0.4, 0.0],
      [0.7, 0.5, 0.8],
    ];
    expect(computeForgetting(a)).toBeCloseTo(0, 4);
  });

  it("returns positive value when final performance drops from peak", () => {
    // Column 0 (task 0): max_{k=0}^{0}=0.9, final=0.6 → 0.3
    // Column 1 (task 1): max_{k=0}^{1}=max(0.0,0.7)=0.7, final=0.7 → 0.0
    // Column 2 excluded (last eval task)
    // Mean = (0.3 + 0.0) / 2 = 0.15
    const a = [
      [0.9, 0.0, 0.0],
      [0.8, 0.7, 0.0],
      [0.6, 0.7, 0.9],
    ];
    expect(computeForgetting(a)).toBeCloseTo(0.15, 4);
  });

  it("throws RangeError for non-square matrix", () => {
    const a = [[0.5], [0.7]];
    expect(() => computeForgetting(a)).toThrow(RangeError);
  });

  it("returns 0 for empty matrix", () => {
    expect(computeForgetting([])).toBe(0);
  });

  it("returns 0 for N=1 (single training stage)", () => {
    expect(computeForgetting([[0.9]])).toBe(0);
  });

  it("handles constant performance across training stages", () => {
    // Column 0: max_{k=0}^{0}=0.5, final=0.5 → 0
    // Column 1 excluded
    const a = [
      [0.5, 0.0],
      [0.5, 0.7],
    ];
    expect(computeForgetting(a)).toBeCloseTo(0, 4);
  });

  it("computes correctly with two tasks", () => {
    // Column 0 (task 0): max_{k=0}^{0}=0.9, final=0.6 → 0.3
    // Column 1 excluded (last eval task)
    // Mean = 0.3 / 1 = 0.3
    const a = [
      [0.9, 0.0],
      [0.6, 0.8],
    ];
    expect(computeForgetting(a)).toBeCloseTo(0.3, 4);
  });

  it("forgetting is never negative (clamped at 0)", () => {
    // Final row outperforms all prior rows on task 0
    const a = [
      [0.5, 0.0],
      [0.7, 0.8],
    ];
    expect(computeForgetting(a)).toBeGreaterThanOrEqual(0);
  });
});

// --- computeCLFbeta ---

describe("computeCLFbeta", () => {
  it("computes harmonic mean of plasticity and stability", () => {
    const a = [
      [0.8, 0.7],
      [0.7, 0.9],
    ];
    const result = computeCLFbeta(a);
    // Plasticity = (0.8+0.9)/2 = 0.85
    // Forgetting: col 0: max_{k=0}^{0}=0.8, final=0.7, f=0.1 → mean=0.1
    // Stability = 1 - 0.1 = 0.9
    // Fβ(1) = 2*0.85*0.9 / (0.85+0.9) = 1.53/1.75 ≈ 0.8743
    expect(result).toBeCloseTo(0.8743, 3);
  });

  it("returns 0 when plasticity is 0", () => {
    const a = [
      [0.0, 0.5],
      [0.3, 0.0],
    ];
    expect(computeCLFbeta(a)).toBe(0);
  });

  it("returns 0 when stability is 0 (complete forgetting)", () => {
    // Column 0: max_{k=0}^{0}=1.0, final=0.0 → forgetting=1.0, stability=0
    const a = [
      [1.0, 0.0],
      [0.0, 0.5],
    ];
    expect(computeCLFbeta(a)).toBe(0);
  });

  it("uses default beta=1 (equal weight)", () => {
    const a = [
      [0.8, 0.7],
      [0.7, 0.9],
    ];
    const defaultResult = computeCLFbeta(a);
    const beta1Result = computeCLFbeta(a, 1);
    expect(defaultResult).toBeCloseTo(beta1Result, 10);
  });

  it("accepts custom beta parameter", () => {
    const a = [
      [0.8, 0.7],
      [0.7, 0.9],
    ];
    const beta1 = computeCLFbeta(a, 1);
    const beta2 = computeCLFbeta(a, 2);
    expect(beta1).not.toBeCloseTo(beta2, 4);
  });

  it("returns 0 for empty matrix", () => {
    expect(computeCLFbeta([])).toBe(0);
  });

  it("cl_f_beta is always in [0, 1] for performance values in [0, 1]", () => {
    const a1 = [
      [0.9, 0.8],
      [0.85, 0.95],
    ];
    expect(computeCLFbeta(a1)).toBeGreaterThanOrEqual(0);
    expect(computeCLFbeta(a1)).toBeLessThanOrEqual(1);

    const a2 = [
      [1.0, 0.0],
      [0.5, 0.9],
    ];
    expect(computeCLFbeta(a2)).toBeGreaterThanOrEqual(0);
    expect(computeCLFbeta(a2)).toBeLessThanOrEqual(1);
  });

  it("handles beta=0 without division by zero", () => {
    const a = [
      [0.8, 0.7],
      [0.7, 0.9],
    ];
    expect(() => computeCLFbeta(a, 0)).not.toThrow();
    expect(Number.isFinite(computeCLFbeta(a, 0))).toBe(true);
  });
});

// --- computeCLScore ---
// CL-Score = ACC + FWT - Forgetting
// ACC = mean of last row (final accuracy after all training)

describe("computeCLScore", () => {
  it("computes composite score from ACC, FWT, and forgetting", () => {
    const a = [
      [0.8, 0.7],
      [0.7, 0.9],
    ];
    const baseline = [0.5, 0.6];
    const score = computeCLScore(a, baseline);
    expect(typeof score).toBe("number");

    // ACC = mean of last row = (0.7 + 0.9) / 2 = 0.8
    // FWT = (a[0][1] - baseline[1]) / 1 = (0.7 - 0.6) / 1 = 0.1
    // Forgetting: col 0 only: max_{k=0}^{0}=0.8, final=0.7, f=0.1 → mean=0.1/1=0.1
    // CL-Score = 0.8 + 0.1 - 0.1 = 0.8
    expect(score).toBeCloseTo(0.8, 4);
  });

  it("is higher when ACM outperforms baseline in transfer", () => {
    const a = [
      [0.9, 0.9],
      [0.9, 0.9],
    ];
    const baselineLow = [0.3, 0.3];
    const baselineHigh = [0.8, 0.8];
    const scoreLow = computeCLScore(a, baselineLow);
    const scoreHigh = computeCLScore(a, baselineHigh);
    expect(scoreLow).toBeGreaterThan(scoreHigh);
  });

  it("returns 0 for empty matrix", () => {
    expect(computeCLScore([], [])).toBe(0);
  });
});

// --- computeAllCLMetrics ---

describe("computeAllCLMetrics", () => {
  it("returns all metric fields", () => {
    const a = [
      [0.8, 0.7],
      [0.7, 0.9],
    ];
    const baseline = [0.5, 0.6];
    const result = computeAllCLMetrics(a, baseline);

    expect(result).toHaveProperty("forward_transfer");
    expect(result).toHaveProperty("forgetting");
    expect(result).toHaveProperty("cl_f_beta");
    expect(result).toHaveProperty("cl_score");
    expect(result).toHaveProperty("plasticity");
    expect(result).toHaveProperty("stability");
  });

  it("computes consistent values across individual functions", () => {
    const a = [
      [0.8, 0.7],
      [0.7, 0.9],
    ];
    const baseline = [0.5, 0.6];
    const result = computeAllCLMetrics(a, baseline);

    // stability = max(0, 1 - forgetting)
    expect(result.stability).toBeCloseTo(Math.max(0, 1 - result.forgetting), 10);

    // forward_transfer matches standalone
    expect(result.forward_transfer).toBeCloseTo(computeForwardTransfer(a, baseline), 10);

    // forgetting matches standalone
    expect(result.forgetting).toBeCloseTo(computeForgetting(a), 10);

    // cl_f_beta matches standalone (both use β=1)
    expect(result.cl_f_beta).toBeCloseTo(computeCLFbeta(a), 10);
  });

  it("handles perfect scenario (no forgetting, high performance)", () => {
    // Column 0: max_{k=0}^{0}=1.0, final=1.0 → 0 forgetting
    // Column 1: excluded
    const a = [
      [1.0, 0.5],
      [1.0, 1.0],
    ];
    const baseline = [0.5, 0.5];
    const result = computeAllCLMetrics(a, baseline);

    expect(result.forgetting).toBe(0);
    expect(result.stability).toBe(1);
    expect(result.plasticity).toBeCloseTo(1.0, 4);
    // FWT = (a[0][1] - baseline[1]) / 1 = (0.5 - 0.5) / 1 = 0
    expect(result.forward_transfer).toBeCloseTo(0, 4);
  });

  it("handles 3x3 matrix with mixed performance", () => {
    // Matrix: rows = training stage, cols = eval task
    const a = [
      [0.9, 0.3, 0.2], // trained through task 0
      [0.7, 0.8, 0.4], // trained through task 1
      [0.6, 0.7, 0.8], // trained through task 2 (final)
    ];
    const baseline = [0.4, 0.3, 0.3];
    const result = computeAllCLMetrics(a, baseline);

    // Plasticity = mean diagonal = (0.9 + 0.8 + 0.8) / 3 ≈ 0.8333
    expect(result.plasticity).toBeCloseTo(0.8333, 3);

    // Forgetting (cols 0,1 only, exclude col 2, max up to stage j):
    // col 0: max_{k=0}^{0}=0.9, final=0.6, f=0.3
    // col 1: max_{k=0}^{1}=max(0.3,0.8)=0.8, final=0.7, f=0.1
    // mean = (0.3 + 0.1) / 2 = 0.2
    expect(result.forgetting).toBeCloseTo(0.2, 4);

    // FWT: (a[0][1]-baseline[1] + a[1][2]-baseline[2]) / 2
    // = (0.3-0.3 + 0.4-0.3) / 2 = (0.0 + 0.1) / 2 = 0.05
    expect(result.forward_transfer).toBeCloseTo(0.05, 4);

    // ACC = mean of last row = (0.6 + 0.7 + 0.8) / 3 = 0.7
    // CL-Score = 0.7 + 0.05 - 0.2 = 0.55
    expect(result.cl_score).toBeCloseTo(0.55, 4);
  });
});
