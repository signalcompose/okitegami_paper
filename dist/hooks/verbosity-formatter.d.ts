/**
 * Verbosity-aware systemMessage formatting for ACM hooks (Issue #88)
 */
import type { Verbosity } from "../store/types.js";
import type { RetrievalResult } from "../retrieval/types.js";
/**
 * Format injection results as a systemMessage string for SessionStart.
 */
export declare function formatInjectionMessage(results: RetrievalResult[], verbosity: Verbosity): string;
export interface SessionEndSummary {
    corrective_count: number;
    entries_generated: number;
    entries_persisted: number;
    corrective_details?: Array<{
        prompt: string;
        method: string;
        confidence?: number;
    }>;
}
/**
 * Format session-end results as a systemMessage string for SessionEnd/Stop.
 */
export declare function formatSessionEndMessage(summary: SessionEndSummary, verbosity: Verbosity): string;
//# sourceMappingURL=verbosity-formatter.d.ts.map