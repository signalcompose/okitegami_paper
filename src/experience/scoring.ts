/**
 * Signal strength scoring — SPECIFICATION.md Section 2.2
 *
 * Pure functions: SessionSummary → number | null
 * Returns null when the summary doesn't qualify for the given direction.
 *
 * Revised: Interrupt alone is ambiguous (not auto-failure).
 * Corrective instruction count is the primary failure signal.
 * Interrupt acts as a strength modifier (+0.10) when corrective instructions exist.
 */

import type { SessionSummary } from "../signals/signal-collector.js";

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Compute failure signal strength.
 * Returns null if no corrective instructions detected.
 *
 * Interrupt alone → null (ambiguous, no experience generated).
 * Corrective 1-2, no interrupt → 0.30–0.50.
 * Corrective 1-2, interrupted  → 0.40–0.60.
 * Corrective 3+,  no interrupt → 0.60–0.80.
 * Corrective 3+,  interrupted  → 0.70–0.90.
 */
export function computeFailureStrength(summary: SessionSummary): number | null {
  const count = summary.corrective_instruction_count;
  if (count === 0) return null;

  const interruptBoost = summary.was_interrupted ? 0.1 : 0;

  if (count >= 3) {
    const cap = summary.was_interrupted ? 0.9 : 0.8;
    return round(Math.min(cap, 0.6 + interruptBoost + (count - 3) * 0.05));
  }
  return round(Math.min(0.6, 0.3 + interruptBoost + (count - 1) * 0.1));
}

/**
 * Compute success signal strength.
 * Returns null if session doesn't qualify as success.
 *
 * Must only be called when computeFailureStrength() returned null.
 * Guards independently against interrupted + 0 corrective (ambiguous).
 */
export function computeSuccessStrength(
  summary: SessionSummary,
  totalToolCalls: number
): number | null {
  // Ambiguous: interrupted but no corrective feedback
  if (summary.was_interrupted && summary.corrective_instruction_count === 0) {
    return null;
  }

  // All tool calls failed but no corrective instruction — ambiguous, not a success
  if (totalToolCalls > 0 && summary.counts.tool_success === 0) {
    return null;
  }

  const toolSuccessRatio = totalToolCalls > 0 ? summary.counts.tool_success / totalToolCalls : 0;

  // Test pass + uninterrupted → 0.70–0.85
  if (summary.has_test_pass) {
    return round(0.7 + toolSuccessRatio * 0.15);
  }

  // Uninterrupted (no tests) → 0.40–0.60
  return round(0.4 + toolSuccessRatio * 0.2);
}
