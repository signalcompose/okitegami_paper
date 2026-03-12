/**
 * Corrective instruction pattern matching — SPECIFICATION.md Section 3.3
 *
 * Regex-based detection of user corrections in prompt text.
 * Supports English and Japanese patterns.
 */
const PATTERNS = [
    // English patterns (case-insensitive)
    { regex: /\bthat'?s\s+wrong\b/i, label: "that's wrong", language: "en" },
    { regex: /\btry\s+again\b/i, label: "try again", language: "en" },
    { regex: /\bnot\s+what\s+I\s+meant\b/i, label: "not what I meant", language: "en" },
    { regex: /\bundo\b/i, label: "undo", language: "en" },
    { regex: /\brevert\b/i, label: "revert", language: "en" },
    { regex: /\bwrong\s+(approach|way|file|method)\b/i, label: "wrong approach", language: "en" },
    { regex: /\bdon'?t\s+do\s+that\b/i, label: "don't do that", language: "en" },
    { regex: /\bstop,?\s+(that|this|no|it)\b/i, label: "stop, that's", language: "en" },
    { regex: /\bno\s+no\b/i, label: "no no", language: "en" },
    { regex: /\buse\s+\S+\s+instead\b/i, label: "use X instead", language: "en" },
    // Japanese patterns
    { regex: /違う/, label: "違う", language: "ja" },
    { regex: /やり直/, label: "やり直し", language: "ja" },
    { regex: /そうじゃない/, label: "そうじゃない", language: "ja" },
    { regex: /元に戻/, label: "元に戻して", language: "ja" },
    { regex: /取り消/, label: "取り消し", language: "ja" },
    { regex: /間違/, label: "間違い", language: "ja" },
    { regex: /ダメ/, label: "ダメ", language: "ja" },
    { regex: /やめて/, label: "やめて", language: "ja" },
];
export function detectCorrectiveInstruction(text) {
    for (const { regex, label, language } of PATTERNS) {
        if (regex.test(text)) {
            return { pattern: label, language };
        }
    }
    return null;
}
//# sourceMappingURL=patterns.js.map