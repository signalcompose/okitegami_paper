import { describe, it, expect } from "vitest";
import { cosineSimilarity } from "../../src/retrieval/similarity.js";

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical vectors", () => {
    const a = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1.0, 5);
  });

  it("returns 1.0 for same-direction vectors of different magnitude", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([5, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });

  it("returns 0.0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it("clamps negative similarity to 0.0", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBe(0.0);
  });

  it("returns 0.0 for zero vector", () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBe(0.0);
  });

  it("returns 0.0 when both vectors are zero", () => {
    const a = new Float32Array([0, 0, 0]);
    expect(cosineSimilarity(a, a)).toBe(0.0);
  });

  it("throws for vectors of different length", () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([1, 2, 3]);
    expect(() => cosineSimilarity(a, b)).toThrow("same length");
  });

  it("computes correct similarity for known vectors", () => {
    // cos([1,1], [1,0]) = 1 / sqrt(2) ≈ 0.7071
    const a = new Float32Array([1, 1]);
    const b = new Float32Array([1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1 / Math.sqrt(2), 4);
  });

  it("handles 384-dimensional vectors", () => {
    const a = new Float32Array(384).fill(1);
    const b = new Float32Array(384).fill(1);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });
});
