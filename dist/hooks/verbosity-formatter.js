/**
 * Format injection results as a systemMessage string for SessionStart.
 */
export function formatInjectionMessage(results, verbosity) {
    if (results.length === 0)
        return "";
    if (verbosity === "quiet") {
        return `[ACM] ${results.length} experiences injected`;
    }
    const projects = [...new Set(results.map((r) => r.entry.project).filter(Boolean))];
    const fromClause = projects.length > 0 ? ` from ${projects.join(", ")}` : "";
    const lines = [];
    lines.push("[ACM] === Experience Injection ===");
    lines.push(`[ACM] ${results.length} experiences injected${fromClause}`);
    for (const { entry, similarity, score } of results) {
        let line = `[ACM]   - ${entry.type}: "${entry.trigger}" (strength: ${entry.signal_strength.toFixed(2)})`;
        if (verbosity === "verbose") {
            line += ` [similarity: ${similarity.toFixed(4)}, score: ${score.toFixed(4)}]`;
        }
        lines.push(line);
    }
    lines.push("[ACM] ==============================");
    return lines.join("\n");
}
/**
 * Format session-end results as a systemMessage string for SessionEnd.
 */
export function formatSessionEndMessage(summary, verbosity) {
    if (summary.corrective_count === 0 && summary.entries_generated === 0)
        return "";
    if (verbosity === "quiet") {
        return `[ACM] ${summary.corrective_count} correctives detected, ${summary.entries_generated} experiences generated`;
    }
    const lines = [];
    lines.push("[ACM] === Session Summary ===");
    if (summary.corrective_count > 0) {
        lines.push(`[ACM] ${summary.corrective_count} corrective instructions detected`);
        if (summary.corrective_details) {
            for (const detail of summary.corrective_details) {
                let line = `[ACM]   - "${detail.prompt}"`;
                if (verbosity === "verbose") {
                    line += ` [method: ${detail.method}`;
                    if (detail.confidence !== undefined) {
                        line += `, confidence: ${detail.confidence}`;
                    }
                    line += "]";
                }
                lines.push(line);
            }
        }
    }
    if (summary.entries_generated > 0) {
        lines.push(`[ACM] ${summary.entries_generated} experiences generated, ${summary.entries_persisted} persisted`);
    }
    lines.push("[ACM] ============================");
    return lines.join("\n");
}
//# sourceMappingURL=verbosity-formatter.js.map