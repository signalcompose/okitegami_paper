import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Embedder } from "../../src/retrieval/embedder.js";
import { cosineSimilarity } from "../../src/retrieval/similarity.js";

describe("Embedder", () => {
  let embedder: Embedder;

  beforeAll(async () => {
    embedder = new Embedder();
    await embedder.initialize();
  }, 60_000);

  afterAll(() => {
    embedder.dispose();
  });

  it("generates a 384-dimensional Float32Array", async () => {
    const embedding = await embedder.embed("hello world");
    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding.length).toBe(384);
  });

  it("returns consistent embeddings for the same text", async () => {
    const a = await embedder.embed("fix the bug in auth module");
    const b = await embedder.embed("fix the bug in auth module");
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 4);
  });

  it("returns high similarity for semantically similar texts", async () => {
    const a = await embedder.embed("fix the authentication bug");
    const b = await embedder.embed("repair the login error");
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0.5);
  });

  it("returns lower similarity for unrelated texts", async () => {
    const a = await embedder.embed("fix the authentication bug");
    const b = await embedder.embed("create a CSS animation for the homepage");
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeLessThan(0.5);
  });

  it("returns high similarity for Japanese semantically similar texts", async () => {
    const a = await embedder.embed("認証のバグを修正する");
    const b = await embedder.embed("ログイン機能のエラーを直す");
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0.5);
  });

  it("returns high cross-lingual similarity for same concept", async () => {
    const ja = await embedder.embed("認証のバグを修正する");
    const en = await embedder.embed("fix the authentication bug");
    const sim = cosineSimilarity(ja, en);
    expect(sim).toBeGreaterThan(0.5);
  });

  it("throws for empty string", async () => {
    await expect(embedder.embed("")).rejects.toThrow("empty");
  });

  it("throws if not initialized", async () => {
    const fresh = new Embedder();
    await expect(fresh.embed("test")).rejects.toThrow("not initialized");
  });

  it("allows retry after initialization failure", async () => {
    const fresh = new Embedder();
    // First call: dispose sets pipeline to null, so embed would fail
    // We test that after dispose (simulating failure), reinitialize works
    await fresh.initialize();
    expect(fresh.initialized).toBe(true);
    fresh.dispose();
    expect(fresh.initialized).toBe(false);
    // Re-initialize should succeed (initPromise was cleared by dispose)
    await fresh.initialize();
    expect(fresh.initialized).toBe(true);
    const result = await fresh.embed("retry test");
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(384);
    fresh.dispose();
  });

  it("rejects with timeout error when initialize exceeds timeoutMs (#138)", async () => {
    const fresh = new Embedder();
    // 1ms timeout will fire before @xenova/transformers model load completes
    await expect(fresh.initialize(1)).rejects.toThrow(/timeout after 1ms/);
    expect(fresh.initialized).toBe(false);
    fresh.dispose();
  });
});
