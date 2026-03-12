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
            line = `- SUCCESS: ${entry.trigger} → ${entry.action} (strength: ${scoreStr})`;
        }
        else {
            const feedback = entry.interrupt_context?.dialogue_summary;
            if (feedback) {
                line = `- FAILURE: ${entry.trigger} → ${entry.action}, user feedback: "${feedback}" (strength: ${scoreStr})`;
            }
            else {
                line = `- FAILURE: ${entry.trigger} → ${entry.action} (strength: ${scoreStr})`;
            }
        }
        const detailLine = `  Details: ~/.acm/experiences/${entry.id}.json`;
        const blockLen = line.length + 1 + detailLine.length + 1;
        if (totalChars + blockLen > TOKEN_BUDGET_CHARS)
            break;
        lines.push(line);
        lines.push(detailLine);
        totalChars += blockLen;
    }
    // Return empty if no entries fit (avoid misleading header-only output)
    if (lines.length === 1)
        return "";
    return lines.join("\n");
}
//# sourceMappingURL=injector.js.map