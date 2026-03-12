/**
 * Corrective instruction pattern matching — SPECIFICATION.md Section 3.3
 *
 * Regex-based detection of user corrections in prompt text.
 * Supports English and Japanese patterns.
 */
export interface CorrectiveMatch {
    pattern: string;
    language: "en" | "ja";
}
export declare function detectCorrectiveInstruction(text: string): CorrectiveMatch | null;
//# sourceMappingURL=patterns.d.ts.map