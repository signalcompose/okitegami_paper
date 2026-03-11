/**
 * Retriever — SPECIFICATION Section 4.3
 * Top-K ranked search over experience DB using cosine similarity * signal_strength.
 */
import { ExperienceStore } from "../store/experience-store.js";
import type { RetrievalResult } from "./types.js";
export declare class Retriever {
    private store;
    constructor(store: ExperienceStore);
    retrieve(queryEmbedding: Float32Array, topK: number): RetrievalResult[];
}
//# sourceMappingURL=retriever.d.ts.map