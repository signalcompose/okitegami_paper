/**
 * Injection text formatting — SPECIFICATION Section 3.1 (injection format)
 * Formats retrieval results into compact context injection text.
 * Budget: ~500 tokens ≈ 2000 characters.
 */
import type { RetrievalResult } from "./types.js";

const HEADER = "[ACM Context]\nPast relevant experience:";
const TOKEN_BUDGET_CHARS = 2000; // ~500 tokens at 4 chars/token

// High-strength entries get their corrective instruction bodies inlined.
// See docs/SPECIFICATION.md Section 3.1. Threshold is on `score` (includes retrieval boost),
// not raw signal_strength. Policy surface deferred to #130.
export const INJECT_CORRECTIVE_BODIES_SCORE_THRESHOLD = 0.6;
export const MAX_INLINED_BODIES_PER_ENTRY = 3;

export function formatInjection(results: RetrievalResult[]): string {
  if (results.length === 0) return "";

  const lines: string[] = [HEADER];
  let totalChars = HEADER.length;

  for (const { entry, score } of results) {
    const scoreStr = score.toFixed(2);
    let block: string;

    if (entry.type === "success") {
      block = `- SUCCESS: ${entry.trigger} → ${entry.outcome} (strength: ${scoreStr})`;
    } else {
      const feedback = entry.interrupt_context?.dialogue_summary;
      const header = feedback
        ? `- FAILURE: ${entry.trigger} → ${entry.outcome}, user feedback: "${feedback}" (strength: ${scoreStr})`
        : `- FAILURE: ${entry.trigger} → ${entry.outcome} (strength: ${scoreStr})`;

      const bodies = entry.corrective_bodies;
      const shouldInline =
        bodies && bodies.length > 0 && score >= INJECT_CORRECTIVE_BODIES_SCORE_THRESHOLD;

      if (shouldInline) {
        const bodyLines = bodies.slice(0, MAX_INLINED_BODIES_PER_ENTRY).map((b) => `    • "${b}"`);
        block = [header, ...bodyLines].join("\n");
      } else {
        block = header;
      }
    }

    const blockLen = block.length + 1;
    if (totalChars + blockLen > TOKEN_BUDGET_CHARS) break;
    lines.push(block);
    totalChars += blockLen;
  }

  // Return empty if no entries fit (avoid misleading header-only output)
  if (lines.length === 1) return "";

  return lines.join("\n");
}
