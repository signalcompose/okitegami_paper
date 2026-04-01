/**
 * Injection text formatting — SPECIFICATION Section 3.1 (injection format)
 * Formats retrieval results into compact context injection text.
 * Budget: ~500 tokens ≈ 2000 characters.
 */
import type { RetrievalResult } from "./types.js";
export declare function formatInjection(results: RetrievalResult[]): string;
/**
 * Format signal detection instruction for Claude Code.
 * Instructs Claude to report corrective feedback via acm_record_signal.
 */
export declare function formatSignalInstruction(sessionId: string): string;
//# sourceMappingURL=injector.d.ts.map