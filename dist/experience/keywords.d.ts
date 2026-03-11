/**
 * Retrieval key extraction from session signals
 *
 * Regex-based keyword extraction (no NLP/LLM).
 * Extracts from tool names, error messages, and user prompts.
 */
import type { SessionSignal } from "../signals/types.js";
/**
 * Extract retrieval keys from session signals.
 *
 * Sources:
 * - tool_success: tool_name
 * - interrupt: tool_name, error keywords
 * - post_interrupt_turn: prompt keywords
 * - corrective_instruction: prompt keywords
 */
export declare function extractRetrievalKeys(signals: SessionSignal[], maxKeys?: number): string[];
//# sourceMappingURL=keywords.d.ts.map