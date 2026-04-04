/**
 * TranscriptParser — Claude Code transcript JSONL parsing
 * Issue #83: transcript-based corrective instruction detection
 *
 * Parses JSONL transcript files to extract real user messages
 * and detect interrupt patterns. Uses `permissionMode` field
 * as the discriminator for real human input (vs tool results).
 */
import { readFileSync, existsSync } from "node:fs";
// --- Constants ---
const INTERRUPT_PATTERNS = [
    "[Request interrupted by user]",
    "[Request interrupted by user for tool use]",
];
// --- Implementation ---
function extractText(content) {
    if (typeof content === "string")
        return content;
    return content
        .filter((block) => block.type === "text" && block.text)
        .map((block) => block.text)
        .join("\n");
}
function isInterrupt(entry) {
    if (entry.type !== "user" || !entry.message)
        return false;
    const text = extractText(entry.message.content);
    return INTERRUPT_PATTERNS.includes(text);
}
function isRealUserMessage(entry) {
    return (entry.type === "user" &&
        entry.permissionMode != null &&
        entry.message != null);
}
export function parseTranscript(transcriptPath) {
    if (!existsSync(transcriptPath)) {
        return { turns: [], interruptCount: 0, totalHumanMessages: 0 };
    }
    const raw = readFileSync(transcriptPath, "utf-8");
    if (!raw.trim()) {
        return { turns: [], interruptCount: 0, totalHumanMessages: 0 };
    }
    const lines = raw.split("\n").filter((line) => line.trim());
    const turns = [];
    let interruptCount = 0;
    let totalHumanMessages = 0;
    let lastWasInterrupt = false;
    let malformedCount = 0;
    for (const line of lines) {
        let entry;
        try {
            entry = JSON.parse(line);
        }
        catch {
            malformedCount++;
            continue;
        }
        if (isInterrupt(entry)) {
            interruptCount++;
            lastWasInterrupt = true;
            continue;
        }
        if (isRealUserMessage(entry)) {
            totalHumanMessages++;
            const text = extractText(entry.message.content);
            turns.push({
                index: turns.length,
                humanMessage: {
                    text,
                    timestamp: entry.timestamp ?? "",
                    promptId: entry.promptId ?? "",
                    uuid: entry.uuid ?? "",
                },
                isAfterInterrupt: lastWasInterrupt,
            });
            lastWasInterrupt = false;
        }
    }
    if (malformedCount > 0) {
        console.error(`[ACM] parseTranscript: skipped ${malformedCount} malformed JSON line(s) in ${transcriptPath}`);
    }
    return { turns, interruptCount, totalHumanMessages };
}
//# sourceMappingURL=transcript-parser.js.map