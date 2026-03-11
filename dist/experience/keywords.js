/**
 * Retrieval key extraction from session signals
 *
 * Regex-based keyword extraction (no NLP/LLM).
 * Extracts from tool names, error messages, and user prompts.
 */
const STOP_WORDS = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "shall",
    "can",
    "need",
    "must",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "at",
    "by",
    "from",
    "as",
    "into",
    "about",
    "between",
    "through",
    "after",
    "before",
    "and",
    "but",
    "or",
    "nor",
    "not",
    "no",
    "so",
    "if",
    "then",
    "that",
    "this",
    "these",
    "those",
    "it",
    "its",
    "i",
    "you",
    "he",
    "she",
    "we",
    "they",
    "me",
    "him",
    "her",
    "us",
    "them",
    "my",
    "your",
    "his",
    "our",
    "their",
    "what",
    "which",
    "who",
    "whom",
    "how",
    "when",
    "where",
    "why",
]);
const MIN_WORD_LENGTH = 3;
// Match words that look like identifiers or meaningful terms
const WORD_PATTERN = /\b[A-Za-z][A-Za-z0-9_-]*[A-Za-z0-9]\b|\b[A-Z][a-z]+\b/g;
const DEFAULT_MAX_KEYS = 20;
/**
 * Extract retrieval keys from session signals.
 *
 * Sources:
 * - tool_success: tool_name
 * - interrupt: tool_name, error keywords
 * - post_interrupt_turn: prompt keywords
 * - corrective_instruction: prompt keywords
 */
export function extractRetrievalKeys(signals, maxKeys = DEFAULT_MAX_KEYS) {
    const keys = new Set();
    for (const signal of signals) {
        if (!signal.data)
            continue;
        switch (signal.event_type) {
            case "tool_success":
            case "interrupt": {
                const toolName = signal.data.tool_name;
                if (typeof toolName === "string" && toolName.length > 0) {
                    keys.add(toolName);
                }
                if (signal.event_type === "interrupt") {
                    const error = signal.data.error;
                    if (typeof error === "string") {
                        addWordsFromText(error, keys);
                    }
                }
                break;
            }
            case "post_interrupt_turn":
            case "corrective_instruction": {
                const prompt = signal.data.prompt;
                if (typeof prompt === "string") {
                    addWordsFromText(prompt, keys);
                }
                break;
            }
        }
    }
    const result = [...keys];
    if (result.length > maxKeys) {
        return result.slice(0, maxKeys);
    }
    return result;
}
function addWordsFromText(text, keys) {
    const matches = text.match(WORD_PATTERN);
    if (!matches)
        return;
    for (const word of matches) {
        const lower = word.toLowerCase();
        if (lower.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(lower)) {
            // Preserve original case for PascalCase/camelCase identifiers
            keys.add(word.includes("_") || /[A-Z]/.test(word.slice(1)) ? word : lower);
        }
    }
}
//# sourceMappingURL=keywords.js.map