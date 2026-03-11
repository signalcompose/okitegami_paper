/**
 * Random value generation utilities
 * Shared utilities for generating random values based on RandomValue specs
 */

import { RandomValue } from "./types.js";

/**
 * Generate a random value based on the random spec
 */
export function generateRandomValue(spec: RandomValue, min: number, max: number): number {
  if (spec.type === "full-random") {
    return Math.random() * (max - min) + min;
  } else {
    const value = spec.center + (Math.random() * 2 - 1) * spec.range;
    return Math.max(min, Math.min(max, value));
  }
}
