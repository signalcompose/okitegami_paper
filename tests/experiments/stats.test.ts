import { describe, it, expect } from "vitest";
import {
  pearsonR,
  crossSessionImprovement,
  mean,
  standardDeviation,
} from "../../experiments/harness/stats.js";

describe("stats", () => {
  describe("mean", () => {
    it("calculates mean of numbers", () => {
      expect(mean([1, 2, 3, 4, 5])).toBe(3);
    });

    it("returns 0 for empty array", () => {
      expect(mean([])).toBe(0);
    });

    it("handles single value", () => {
      expect(mean([42])).toBe(42);
    });
  });

  describe("standardDeviation", () => {
    it("calculates population standard deviation", () => {
      // [2, 4, 4, 4, 5, 5, 7, 9] → mean=5, variance=4, std=2
      expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.0, 5);
    });

    it("returns 0 for empty array", () => {
      expect(standardDeviation([])).toBe(0);
    });

    it("returns 0 for single value", () => {
      expect(standardDeviation([5])).toBe(0);
    });

    it("returns 0 for all same values", () => {
      expect(standardDeviation([3, 3, 3, 3])).toBe(0);
    });
  });

  describe("pearsonR", () => {
    it("returns 1.0 for perfect positive correlation", () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];
      expect(pearsonR(x, y)).toBeCloseTo(1.0, 5);
    });

    it("returns -1.0 for perfect negative correlation", () => {
      const x = [1, 2, 3, 4, 5];
      const y = [10, 8, 6, 4, 2];
      expect(pearsonR(x, y)).toBeCloseTo(-1.0, 5);
    });

    it("returns ~0 for uncorrelated data", () => {
      // Chosen to give near-zero correlation
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 1, 5, 3];
      const r = pearsonR(x, y);
      expect(Math.abs(r)).toBeLessThan(0.5);
    });

    it("returns NaN for empty arrays", () => {
      expect(pearsonR([], [])).toBeNaN();
    });

    it("returns NaN for single data point", () => {
      expect(pearsonR([1], [2])).toBeNaN();
    });

    it("returns NaN when one array has zero variance", () => {
      expect(pearsonR([1, 1, 1], [1, 2, 3])).toBeNaN();
    });

    it("throws when arrays have different lengths", () => {
      expect(() => pearsonR([1, 2], [1, 2, 3])).toThrow();
    });
  });

  describe("crossSessionImprovement", () => {
    it("calculates improvement from session 1 to session 5", () => {
      // Sessions: 0.4, 0.5, 0.6, 0.7, 0.8 → improvement = 0.8 - 0.4 = 0.4
      const sessions = [
        { session_number: 1, completion_rate: 0.4 },
        { session_number: 2, completion_rate: 0.5 },
        { session_number: 3, completion_rate: 0.6 },
        { session_number: 4, completion_rate: 0.7 },
        { session_number: 5, completion_rate: 0.8 },
      ];
      const result = crossSessionImprovement(sessions);
      expect(result.delta).toBeCloseTo(0.4, 5);
      expect(result.first_session_rate).toBeCloseTo(0.4, 5);
      expect(result.last_session_rate).toBeCloseTo(0.8, 5);
    });

    it("handles negative improvement (regression)", () => {
      const sessions = [
        { session_number: 1, completion_rate: 0.8 },
        { session_number: 2, completion_rate: 0.6 },
      ];
      const result = crossSessionImprovement(sessions);
      expect(result.delta).toBeCloseTo(-0.2, 5);
    });

    it("handles single session", () => {
      const sessions = [{ session_number: 1, completion_rate: 0.5 }];
      const result = crossSessionImprovement(sessions);
      expect(result.delta).toBe(0);
    });

    it("handles empty sessions", () => {
      const result = crossSessionImprovement([]);
      expect(result.delta).toBe(0);
      expect(result.first_session_rate).toBe(0);
      expect(result.last_session_rate).toBe(0);
    });

    it("sorts by session_number regardless of input order", () => {
      const sessions = [
        { session_number: 5, completion_rate: 0.9 },
        { session_number: 1, completion_rate: 0.3 },
        { session_number: 3, completion_rate: 0.6 },
      ];
      const result = crossSessionImprovement(sessions);
      expect(result.first_session_rate).toBeCloseTo(0.3, 5);
      expect(result.last_session_rate).toBeCloseTo(0.9, 5);
      expect(result.delta).toBeCloseTo(0.6, 5);
    });
  });
});
