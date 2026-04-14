/**
 * Verbosity-aware systemMessage formatting for ACM hooks (Issue #88)
 */
import type { Verbosity } from "../store/types.js";
import type { RetrievalResult } from "../retrieval/types.js";

/**
 * Format injection results as a systemMessage string for SessionStart.
 */
export function formatInjectionMessage(results: RetrievalResult[], verbosity: Verbosity): string {
  if (results.length === 0) return "";

  if (verbosity === "quiet") {
    return `[ACM] ${results.length} experiences injected`;
  }

  const projects = [...new Set(results.map((r) => r.entry.project).filter(Boolean))];
  const fromClause = projects.length > 0 ? ` from ${projects.join(", ")}` : "";

  const lines: string[] = [];
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

export interface SessionEndSummary {
  corrective_count: number;
  entries_generated: number;
  entries_persisted: number;
  corrective_details?: Array<{
    prompt: string;
    method: string;
    confidence?: number;
  }>;
}

/**
 * Format session-end results as a systemMessage string for SessionEnd/Stop.
 */
export function formatSessionEndMessage(summary: SessionEndSummary, verbosity: Verbosity): string {
  if (summary.corrective_count === 0 && summary.entries_generated === 0) return "";

  if (verbosity === "quiet") {
    return `[ACM] ${summary.corrective_count} correctives detected, ${summary.entries_generated} experiences generated`;
  }

  const lines: string[] = [];
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
    lines.push(
      `[ACM] ${summary.entries_generated} experiences generated, ${summary.entries_persisted} persisted`
    );
  }

  lines.push("[ACM] ============================");
  return lines.join("\n");
}
