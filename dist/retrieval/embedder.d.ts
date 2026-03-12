/**
 * Embedding generation — SPECIFICATION Section 1.3, 4.3
 * Uses @xenova/transformers with all-MiniLM-L6-v2 (384 dimensions).
 */
declare const EMBEDDING_DIM = 384;
export declare class Embedder {
    private pipeline;
    private _initialized;
    private initPromise;
    initialize(): Promise<void>;
    get initialized(): boolean;
    embed(text: string): Promise<Float32Array>;
    dispose(): void;
}
export { EMBEDDING_DIM };
//# sourceMappingURL=embedder.d.ts.map