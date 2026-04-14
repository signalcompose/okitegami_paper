/**
 * Retriever — SPECIFICATION Section 4.3
 * Top-K ranked search using: cosine_similarity × recency_decay × log(retrieval_count + 1) × signal_strength
 */
import { ExperienceStore } from "../store/experience-store.js";
import { cosineSimilarity } from "./similarity.js";
import type { RetrievalResult } from "./types.js";

/**
 * Compute exponential recency decay: exp(-λ × days_since(t))
 * λ = ln(2) / half_life_days
 */
export function recencyDecay(
  referenceDate: string | undefined,
  fallbackDate: string,
  halfLifeDays: number,
  now: Date = new Date()
): number {
  const dateStr = referenceDate ?? fallbackDate;
  const t = new Date(dateStr);
  if (isNaN(t.getTime())) {
    console.warn(`[ACM] recencyDecay: invalid date string "${dateStr}", using decay=1.0`);
    return 1.0;
  }
  const daysSince = Math.max(0, (now.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
  const lambda = Math.LN2 / halfLifeDays;
  return Math.exp(-lambda * daysSince);
}

export class Retriever {
  constructor(
    private store: ExperienceStore,
    private halfLifeDays: number = 30
  ) {}

  // O(n) full scan — acceptable for research prototype.
  retrieve(queryEmbedding: Float32Array, topK: number): RetrievalResult[] {
    const candidates = this.store.getAllWithEmbedding();

    const scored: RetrievalResult[] = [];
    for (const { entry, embedding } of candidates) {
      try {
        const similarity = cosineSimilarity(queryEmbedding, embedding);
        const decay = recencyDecay(entry.last_retrieved_at, entry.timestamp, this.halfLifeDays);
        const retrievalBoost = 1 + Math.log1p(entry.retrieval_count ?? 0);
        const score = similarity * decay * retrievalBoost * entry.signal_strength;
        scored.push({ entry, similarity, score });
      } catch (err) {
        console.warn(
          `[ACM] Skipping entry id="${entry.id}" during retrieval: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, topK);

    // Update retrieval tracking for selected entries
    const now = new Date().toISOString();
    for (const result of results) {
      try {
        this.store.updateRetrievalTracking(result.entry.id);
        result.entry.retrieval_count = (result.entry.retrieval_count ?? 0) + 1;
        result.entry.last_retrieved_at = now;
      } catch (err) {
        console.warn(
          `[ACM] retrieve: tracking update failed for entry id="${result.entry.id}": ` +
            `${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return results;
  }
}
