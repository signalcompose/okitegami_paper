/**
 * Embedding serialization/deserialization — Float32Array ↔ Buffer (SQLite BLOB)
 */
export declare function serializeEmbedding(embedding: Float32Array): Buffer;
export declare function deserializeEmbedding(blob: Buffer, expectedDim?: number): Float32Array;
//# sourceMappingURL=embedding-serde.d.ts.map