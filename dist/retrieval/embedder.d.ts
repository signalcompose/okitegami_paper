/**
 * Embedding generation — SPECIFICATION Section 1.3, 4.3
 * Uses @xenova/transformers with paraphrase-multilingual-MiniLM-L12-v2 (384 dimensions).
 * Supports 50+ languages including Japanese.
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