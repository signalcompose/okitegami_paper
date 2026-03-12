import { cosineSimilarity } from "./similarity.js";
export class Retriever {
    store;
    constructor(store) {
        this.store = store;
    }
    // TODO: O(n) full scan — acceptable for research prototype.
    // If experience DB grows beyond ~1000 entries, consider ANN indexing.
    retrieve(queryEmbedding, topK) {
        const candidates = this.store.getAllWithEmbedding();
        const scored = [];
        for (const { entry, embedding } of candidates) {
            try {
                const similarity = cosineSimilarity(queryEmbedding, embedding);
                scored.push({
                    entry,
                    similarity,
                    score: similarity * entry.signal_strength,
                });
            }
            catch (err) {
                // Skip entries with dimension mismatch rather than failing entire retrieval
                console.warn(`[ACM] Skipping entry id="${entry.id}" during retrieval: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, topK);
    }
}
//# sourceMappingURL=retriever.js.map