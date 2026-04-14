/**
 * Retriever — SPECIFICATION Section 4.3
 * Top-K ranked search using: cosine_similarity × recency_decay × log(retrieval_count + 1) × signal_strength
 */
import { ExperienceStore } from "../store/experience-store.js";
import type { RetrievalResult } from "./types.js";
/**
 * Compute exponential recency decay: exp(-λ × days_since(t))
 * λ = ln(2) / half_life_days
 */
export declare function recencyDecay(referenceDate: string | undefined, fallbackDate: string, halfLifeDays: number, now?: Date): number;
export declare class Retriever {
    private store;
    private halfLifeDays;
    constructor(store: ExperienceStore, halfLifeDays?: number);
    retrieve(queryEmbedding: Float32Array, topK: number): RetrievalResult[];
}
//# sourceMappingURL=retriever.d.ts.map