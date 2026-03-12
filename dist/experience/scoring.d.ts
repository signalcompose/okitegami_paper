/**
 * Signal strength scoring — SPECIFICATION.md Section 2.2
 *
 * Pure functions: SessionSummary → number | null
 * Returns null when the summary doesn't qualify for the given direction.
 */
import type { SessionSummary } from "../signals/signal-collector.js";
/**
 * Compute failure signal strength.
 * Returns null if no failure signal detected.
 *
 * @param summary  Session summary from SignalCollector
 * @param captureTurns  Max post-interrupt turns (config.capture_turns)
 */
export declare function computeFailureStrength(summary: SessionSummary, captureTurns: number): number | null;
/**
 * Compute success signal strength.
 * Returns null if session doesn't qualify as success
 * (interrupted or corrective_instruction_count >= 3).
 *
 * @param summary  Session summary from SignalCollector
 * @param totalToolCalls  Total tool call count for ratio calculation
 */
export declare function computeSuccessStrength(summary: SessionSummary, totalToolCalls: number): number | null;
/**
 * Compute corrective instruction (3+) strength independently.
 * Unlike computeFailureStrength which prioritizes interrupt,
 * this always evaluates corrective count regardless of interrupt state.
 * Used when both interrupt and corrective failures should be generated.
 */
export declare function computeCorrectiveStrength(correctiveCount: number): number | null;
//# sourceMappingURL=scoring.d.ts.map