const HEADER = "[ACM Context]\nPast relevant experience:";
const TOKEN_BUDGET_CHARS = 2000; // ~500 tokens at 4 chars/token
export function formatInjection(results) {
    if (results.length === 0)
        return "";
    const lines = [HEADER];
    let totalChars = HEADER.length;
    for (const { entry, score } of results) {
        const scoreStr = score.toFixed(2);
        let line;
        if (entry.type === "success") {
            line = `- SUCCESS: ${entry.trigger} → ${entry.outcome} (strength: ${scoreStr})`;
        }
        else {
            const feedback = entry.interrupt_context?.dialogue_summary;
            if (feedback) {
                line = `- FAILURE: ${entry.trigger} → ${entry.outcome}, user feedback: "${feedback}" (strength: ${scoreStr})`;
            }
            else {
                line = `- FAILURE: ${entry.trigger} → ${entry.outcome} (strength: ${scoreStr})`;
            }
        }
        const blockLen = line.length + 1;
        if (totalChars + blockLen > TOKEN_BUDGET_CHARS)
            break;
        lines.push(line);
        totalChars += blockLen;
    }
    // Return empty if no entries fit (avoid misleading header-only output)
    if (lines.length === 1)
        return "";
    return lines.join("\n");
}
/**
 * Format signal detection instruction for Claude Code.
 * Instructs Claude to report corrective feedback via acm_record_signal.
 */
export function formatSignalInstruction(sessionId) {
    return `[ACM Signal Detection]
Session: ${sessionId}
When you recognize corrective feedback from the user (approach changes,
undo requests, dissatisfaction, redirections), call acm_record_signal:
  session_id: "${sessionId}"
  event_type: "corrective_instruction"
  data: '{"prompt":"<user message excerpt>","reason":"<brief explanation>"}'`;
}
//# sourceMappingURL=injector.js.map