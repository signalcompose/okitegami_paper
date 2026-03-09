import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Retriever } from "../../src/retrieval/retriever.js";
import { ExperienceStore } from "../../src/store/experience-store.js";
import { makeEntry, makeConfig } from "./helpers.js";

describe("Retriever", () => {
  let store: ExperienceStore;
  let retriever: Retriever;

  beforeEach(() => {
    store = new ExperienceStore(makeConfig());
    retriever = new Retriever(store);
  });

  afterEach(() => {
    store.close();
  });

  it("returns top-K results sorted by score descending", () => {
    const emb1 = new Float32Array([1, 0, 0]);
    const emb2 = new Float32Array([0.9, 0.1, 0]);
    const emb3 = new Float32Array([0, 1, 0]);

    store.createWithEmbedding(makeEntry({ signal_strength: 0.5, session_id: "s1" }), emb1);
    store.createWithEmbedding(makeEntry({ signal_strength: 0.9, session_id: "s2" }), emb2);
    store.createWithEmbedding(makeEntry({ signal_strength: 0.8, session_id: "s3" }), emb3);

    const query = new Float32Array([1, 0, 0]);
    const results = retriever.retrieve(query, 2);

    expect(results).toHaveLength(2);
    // emb2 has high similarity AND high strength → top
    // emb1 has perfect similarity but lower strength
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it("skips entries without embeddings", () => {
    store.create(makeEntry({ session_id: "no-emb" }));
    store.createWithEmbedding(makeEntry({ session_id: "has-emb" }), new Float32Array([1, 0, 0]));

    const query = new Float32Array([1, 0, 0]);
    const results = retriever.retrieve(query, 10);

    expect(results).toHaveLength(1);
    expect(results[0].entry.session_id).toBe("has-emb");
  });

  it("returns fewer than K if not enough entries", () => {
    store.createWithEmbedding(makeEntry(), new Float32Array([1, 0, 0]));

    const query = new Float32Array([1, 0, 0]);
    const results = retriever.retrieve(query, 5);
    expect(results).toHaveLength(1);
  });

  it("returns empty array when no entries exist", () => {
    const query = new Float32Array([1, 0, 0]);
    const results = retriever.retrieve(query, 5);
    expect(results).toHaveLength(0);
  });

  it("returns empty array in disabled mode", () => {
    const disabledStore = new ExperienceStore(makeConfig({ mode: "disabled" }));
    const disabledRetriever = new Retriever(disabledStore);

    disabledStore.createWithEmbedding(makeEntry(), new Float32Array([1, 0, 0]));

    const results = disabledRetriever.retrieve(new Float32Array([1, 0, 0]), 5);
    expect(results).toHaveLength(0);
    disabledStore.close();
  });

  it("filters success_only mode", () => {
    const successStore = new ExperienceStore(makeConfig({ mode: "success_only" }));
    const successRetriever = new Retriever(successStore);
    const emb = new Float32Array([1, 0, 0]);

    successStore.createWithEmbedding(makeEntry({ type: "success", session_id: "s-success" }), emb);
    successStore.createWithEmbedding(
      makeEntry({
        type: "failure",
        signal_type: "interrupt_with_dialogue",
        signal_strength: 0.9,
        session_id: "s-failure",
      }),
      emb
    );

    const results = successRetriever.retrieve(emb, 5);
    expect(results).toHaveLength(1);
    expect(results[0].entry.type).toBe("success");
    successStore.close();
  });

  it("filters failure_only mode", () => {
    const failStore = new ExperienceStore(makeConfig({ mode: "failure_only" }));
    const failRetriever = new Retriever(failStore);
    const emb = new Float32Array([1, 0, 0]);

    failStore.createWithEmbedding(makeEntry({ type: "success", session_id: "s-success" }), emb);
    failStore.createWithEmbedding(
      makeEntry({
        type: "failure",
        signal_type: "interrupt_with_dialogue",
        signal_strength: 0.9,
        session_id: "s-failure",
      }),
      emb
    );

    const results = failRetriever.retrieve(emb, 5);
    expect(results).toHaveLength(1);
    expect(results[0].entry.type).toBe("failure");
    failStore.close();
  });

  it("score = similarity * signal_strength", () => {
    const emb = new Float32Array([1, 0, 0]);
    store.createWithEmbedding(makeEntry({ signal_strength: 0.8 }), emb);

    const query = new Float32Array([1, 0, 0]);
    const results = retriever.retrieve(query, 1);

    expect(results).toHaveLength(1);
    expect(results[0].similarity).toBeCloseTo(1.0, 4);
    expect(results[0].score).toBeCloseTo(0.8, 4);
  });
});
