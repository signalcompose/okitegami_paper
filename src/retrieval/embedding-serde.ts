/**
 * Embedding serialization/deserialization — Float32Array ↔ Buffer (SQLite BLOB)
 */

export function serializeEmbedding(embedding: Float32Array): Buffer {
  return Buffer.from(
    embedding.buffer.slice(
      embedding.byteOffset,
      embedding.byteOffset + embedding.byteLength
    )
  );
}

export function deserializeEmbedding(
  blob: Buffer,
  expectedDim?: number
): Float32Array {
  if (blob.byteLength % 4 !== 0) {
    throw new Error(
      `Embedding BLOB has invalid byte length ${blob.byteLength} (not a multiple of 4)`
    );
  }
  const ab = new ArrayBuffer(blob.byteLength);
  const view = new Uint8Array(ab);
  view.set(blob);
  const result = new Float32Array(ab);
  if (expectedDim !== undefined && result.length !== expectedDim) {
    throw new Error(
      `Embedding has ${result.length} dimensions, expected ${expectedDim}`
    );
  }
  return result;
}
