/**
 * Retriever — SPECIFICATION Section 4.3
 * Top-K ranked search over experience DB using cosine similarity * signal_strength.
 */
import { ExperienceStore } from "../store/experience-store.js";
import { cosineSimilarity } from "./similarity.js";
import type { RetrievalResult } from "./types.js";

export class Retriever {
  constructor(private store: ExperienceStore) {}

  // TODO: O(n) full scan — acceptable for research prototype.
  // If experience DB grows beyond ~1000 entries, consider ANN indexing.
  retrieve(queryEmbedding: Float32Array, topK: number): RetrievalResult[] {
    const candidates = this.store.getAllWithEmbedding();

    const scored: RetrievalResult[] = candidates.map(({ entry, embedding }) => {
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      return {
        entry,
        similarity,
        score: similarity * entry.signal_strength,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}
