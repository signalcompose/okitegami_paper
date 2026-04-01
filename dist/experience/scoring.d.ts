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
export declare function computeFailureStrength(summary: SessionSummary): number | null;
/**
 * Compute success signal strength.
 * Returns null if session doesn't qualify as success.
 *
 * Must only be called when computeFailureStrength() returned null.
 * Guards independently against interrupted + 0 corrective (ambiguous).
 */
export declare function computeSuccessStrength(summary: SessionSummary, totalToolCalls: number): number | null;
//# sourceMappingURL=scoring.d.ts.map