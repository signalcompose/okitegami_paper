import { cosineSimilarity } from "./similarity.js";
/**
 * Compute exponential recency decay: exp(-λ × days_since(t))
 * λ = ln(2) / half_life_days
 */
export function recencyDecay(referenceDate, fallbackDate, halfLifeDays, now = new Date()) {
    const dateStr = referenceDate ?? fallbackDate;
    const t = new Date(dateStr);
    const daysSince = Math.max(0, (now.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
    const lambda = Math.LN2 / halfLifeDays;
    return Math.exp(-lambda * daysSince);
}
export class Retriever {
    store;
    halfLifeDays;
    constructor(store, halfLifeDays = 30) {
        this.store = store;
        this.halfLifeDays = halfLifeDays;
    }
    // O(n) full scan — acceptable for research prototype.
    retrieve(queryEmbedding, topK) {
        const candidates = this.store.getAllWithEmbedding();
        const scored = [];
        for (const { entry, embedding } of candidates) {
            try {
                const similarity = cosineSimilarity(queryEmbedding, embedding);
                const decay = recencyDecay(entry.last_retrieved_at, entry.timestamp, this.halfLifeDays);
                const retrievalBoost = 1 + Math.log1p(entry.retrieval_count ?? 0);
                const score = similarity * decay * retrievalBoost * entry.signal_strength;
                scored.push({ entry, similarity, score });
            }
            catch (err) {
                console.warn(`[ACM] Skipping entry id="${entry.id}" during retrieval: ${err instanceof Error ? err.message : String(err)}`);
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
            }
            catch {
                // Non-critical: tracking update failure should not break retrieval
            }
        }
        return results;
    }
}
//# sourceMappingURL=retriever.js.map