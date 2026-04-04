/**
 * CorrectiveClassifier — Ollama LLM classification + interrupt fallback
 * Issue #83: transcript-based corrective instruction detection
 *
 * Primary: Uses local Ollama LLM to classify user messages as corrective or not.
 * Fallback: When Ollama is unavailable, uses heuristic structural detection.
 */
import type { ParsedTranscript, HumanMessage } from "./transcript-parser.js";
export interface ClassifiedMessage {
    message: HumanMessage;
    corrective: boolean;
    confidence: number;
    reason: string;
    method: "llm" | "structural";
}
export interface ClassifierConfig {
    ollamaUrl?: string;
    model?: string;
    minConfidence?: number;
    timeoutMs?: number;
}
/**
 * Normalize message text for classification by removing Claude Code UI artifacts.
 * Raw text is preserved in HumanMessage.text; this is applied before classification only.
 */
export declare function normalizeForClassification(text: string): string;
export declare function isOllamaAvailable(url: string): Promise<boolean>;
export declare function classifyCorrections(transcript: ParsedTranscript, config?: ClassifierConfig): Promise<ClassifiedMessage[]>;
//# sourceMappingURL=corrective-classifier.d.ts.map