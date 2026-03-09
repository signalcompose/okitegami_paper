/**
 * Embedding generation — SPECIFICATION Section 1.3, 4.3
 * Uses @xenova/transformers with all-MiniLM-L6-v2 (384 dimensions).
 */

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const EMBEDDING_DIM = 384;

export class Embedder {
  private pipeline: any = null;
  private _initialized = false;
  private initPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this._initialized) return;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const { pipeline } = await import("@xenova/transformers");
        this.pipeline = await pipeline("feature-extraction", MODEL_NAME);
        this._initialized = true;
      })();
    }
    return this.initPromise;
  }

  get initialized(): boolean {
    return this._initialized;
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this._initialized) {
      throw new Error("Embedder not initialized. Call initialize() first.");
    }
    if (!text || text.trim().length === 0) {
      throw new Error("Cannot embed empty text");
    }

    const output = await this.pipeline(text, {
      pooling: "mean",
      normalize: true,
    });

    const data = output.data as Float32Array;
    if (data.length !== EMBEDDING_DIM) {
      throw new Error(
        `Expected ${EMBEDDING_DIM} dimensions, got ${data.length}`
      );
    }
    return new Float32Array(data);
  }

  dispose(): void {
    this.pipeline = null;
    this._initialized = false;
  }
}

export { EMBEDDING_DIM };
