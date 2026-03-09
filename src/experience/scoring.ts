/**
 * Signal strength scoring — SPECIFICATION.md Section 2.2
 *
 * Pure functions: SessionSummary → number | null
 * Returns null when the summary doesn't qualify for the given direction.
 */

import type { SessionSummary } from "../signals/signal-collector.js";

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Compute failure signal strength.
 * Returns null if no failure signal detected.
 *
 * @param summary  Session summary from SignalCollector
 * @param captureTurns  Max post-interrupt turns (config.capture_turns)
 */
export function computeFailureStrength(
  summary: SessionSummary,
  captureTurns: number
): number | null {
  // Priority 1: Interrupt + post-interrupt dialogue → 0.90–1.00
  if (summary.was_interrupted) {
    const postTurns = summary.counts.post_interrupt_turn;
    const ratio = captureTurns > 0 ? postTurns / captureTurns : 0;
    return round(0.9 + Math.min(1, ratio) * 0.1);
  }

  const count = summary.corrective_instruction_count;

  // Priority 2: Corrective instruction (3+) → 0.60–0.80
  if (count >= 3) {
    return round(Math.min(0.8, 0.6 + (count - 3) * 0.05));
  }

  // Priority 3: Corrective instruction (1-2) → 0.30–0.50
  if (count >= 1) {
    return round(0.3 + (count - 1) * 0.1);
  }

  return null;
}

/**
 * Compute success signal strength.
 * Returns null if session doesn't qualify as success
 * (interrupted or corrective_instruction_count >= 3).
 *
 * @param summary  Session summary from SignalCollector
 * @param totalToolCalls  Total tool call count for ratio calculation
 */
export function computeSuccessStrength(
  summary: SessionSummary,
  totalToolCalls: number
): number | null {
  // Not a success if interrupted or too many corrective instructions
  if (summary.was_interrupted || summary.corrective_instruction_count >= 3) {
    return null;
  }

  const toolSuccessRatio =
    totalToolCalls > 0 ? summary.counts.tool_success / totalToolCalls : 0;

  // Test pass + uninterrupted → 0.70–0.85
  if (summary.has_test_pass) {
    return round(0.7 + toolSuccessRatio * 0.15);
  }

  // Uninterrupted (no tests) → 0.40–0.60
  return round(0.4 + toolSuccessRatio * 0.2);
}
