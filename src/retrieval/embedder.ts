/**
 * Embedding generation — SPECIFICATION Section 1.3, 4.3
 * Uses @xenova/transformers with paraphrase-multilingual-MiniLM-L12-v2 (384 dimensions).
 * Supports 50+ languages including Japanese.
 */

const MODEL_NAME = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const EMBEDDING_DIM = 384;

export class Embedder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- @xenova/transformers pipeline has no exported type
  private pipeline: any = null;
  private _initialized = false;
  private initPromise: Promise<void> | null = null;

  async initialize(timeoutMs?: number): Promise<void> {
    if (this._initialized) return;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          const { pipeline } = await import("@xenova/transformers");
          const loadPromise = pipeline("feature-extraction", MODEL_NAME);
          // Suppress unhandled rejection if we abandon loadPromise to the timeout path.
          // @xenova/transformers has no AbortController; the load keeps running in the
          // background and would otherwise surface as UnhandledPromiseRejectionWarning
          // (Node 18+ can terminate the process on those). Hook processes are short-lived
          // so the orphaned load is bounded.
          loadPromise.catch(() => {
            /* ignored: race loser or post-timeout failure */
          });
          this.pipeline =
            timeoutMs && timeoutMs > 0
              ? await Promise.race([
                  loadPromise,
                  new Promise<never>((_, reject) =>
                    setTimeout(
                      () => reject(new Error(`Embedder.initialize: timeout after ${timeoutMs}ms`)),
                      timeoutMs
                    )
                  ),
                ])
              : await loadPromise;
          this._initialized = true;
        } catch (err) {
          this.initPromise = null;
          throw err;
        }
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

    const data = output?.data;
    if (!(data instanceof Float32Array)) {
      throw new Error(`Expected Float32Array from pipeline, got ${typeof data}`);
    }
    if (data.length !== EMBEDDING_DIM) {
      throw new Error(`Expected ${EMBEDDING_DIM} dimensions, got ${data.length}`);
    }
    return new Float32Array(data);
  }

  dispose(): void {
    this.pipeline = null;
    this._initialized = false;
    this.initPromise = null;
  }
}

export { EMBEDDING_DIM };
