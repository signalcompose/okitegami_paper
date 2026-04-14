import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ExperienceStore } from "../../src/store/experience-store.js";
import { clusterByEmbedding, buildReflectionPrompt, runEviction } from "../../src/retrieval/gc.js";
import { recencyDecay } from "../../src/retrieval/retriever.js";
import { makeEntry, makeStore, makeConfig } from "./helpers.js";
import type { AcmConfig, ExperienceEntry } from "../../src/store/types.js";

describe("recencyDecay", () => {
  it("returns 1.0 for current timestamp", () => {
    const now = new Date();
    const decay = recencyDecay(now.toISOString(), now.toISOString(), 30, now);
    expect(decay).toBeCloseTo(1.0, 5);
  });

  it("returns ~0.5 at half-life", () => {
    const now = new Date();
    const halfLifeDays = 30;
    const past = new Date(now.getTime() - halfLifeDays * 24 * 60 * 60 * 1000);
    const decay = recencyDecay(past.toISOString(), past.toISOString(), halfLifeDays, now);
    expect(decay).toBeCloseTo(0.5, 2);
  });

  it("uses fallbackDate when referenceDate is undefined", () => {
    const now = new Date();
    const decay = recencyDecay(undefined, now.toISOString(), 30, now);
    expect(decay).toBeCloseTo(1.0, 5);
  });

  it("returns value between 0 and 1 for old entries", () => {
    const now = new Date();
    const old = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const decay = recencyDecay(old.toISOString(), old.toISOString(), 30, now);
    expect(decay).toBeGreaterThan(0);
    expect(decay).toBeLessThan(0.01);
  });
});

describe("clusterByEmbedding", () => {
  it("groups similar embeddings together", () => {
    const entries = [
      {
        entry: makeEntry({ session_id: "s1" }) as ExperienceEntry,
        embedding: new Float32Array([1, 0, 0]),
      },
      {
        entry: makeEntry({ session_id: "s2" }) as ExperienceEntry,
        embedding: new Float32Array([0.95, 0.05, 0]),
      },
      {
        entry: makeEntry({ session_id: "s3" }) as ExperienceEntry,
        embedding: new Float32Array([0, 1, 0]),
      },
    ];

    const clusters = clusterByEmbedding(entries, 0.9);
    // s1 and s2 should be in same cluster, s3 separate
    expect(clusters.length).toBe(2);
    const bigCluster = clusters.find((c) => c.length === 2);
    expect(bigCluster).toBeDefined();
  });

  it("returns each entry in its own cluster when dissimilar", () => {
    const entries = [
      {
        entry: makeEntry({ session_id: "s1" }) as ExperienceEntry,
        embedding: new Float32Array([1, 0, 0]),
      },
      {
        entry: makeEntry({ session_id: "s2" }) as ExperienceEntry,
        embedding: new Float32Array([0, 1, 0]),
      },
      {
        entry: makeEntry({ session_id: "s3" }) as ExperienceEntry,
        embedding: new Float32Array([0, 0, 1]),
      },
    ];

    const clusters = clusterByEmbedding(entries, 0.9);
    expect(clusters.length).toBe(3);
  });

  it("handles empty input", () => {
    const clusters = clusterByEmbedding([]);
    expect(clusters).toEqual([]);
  });
});

describe("buildReflectionPrompt", () => {
  it("includes all entries in prompt", () => {
    const entries = [
      makeEntry({
        trigger: "trigger-A",
        action: "action-A",
        outcome: "outcome-A",
      }) as ExperienceEntry,
      makeEntry({
        trigger: "trigger-B",
        action: "action-B",
        outcome: "outcome-B",
      }) as ExperienceEntry,
    ];

    const prompt = buildReflectionPrompt(entries);
    expect(prompt).toContain("trigger-A");
    expect(prompt).toContain("action-B");
    expect(prompt).toContain("outcome-A");
    expect(prompt).toContain("JSON");
  });
});

describe("runEviction", () => {
  let store: ExperienceStore;
  let config: AcmConfig;

  beforeEach(async () => {
    config = makeConfig({ max_experiences_per_project: 10 });
    store = await makeStore(config);
  });

  afterEach(() => {
    store.close();
  });

  it("does nothing when under capacity", () => {
    store.create(makeEntry({ project: "proj-a" }));
    const result = runEviction(store, "proj-a", config);
    expect(result.archived).toBe(0);
    expect(result.before).toBe(1);
    expect(result.after).toBe(1);
  });

  it("archives excess entries when over capacity", () => {
    for (let i = 0; i < 12; i++) {
      store.create(
        makeEntry({
          session_id: `s${i}`,
          project: "proj-a",
          signal_strength: 0.5 + i * 0.01,
        })
      );
    }

    const result = runEviction(store, "proj-a", config);
    expect(result.archived).toBe(2);
    expect(result.after).toBe(10);
  });

  it("does not evict pinned entries", () => {
    for (let i = 0; i < 12; i++) {
      const entry = store.create(
        makeEntry({
          session_id: `s${i}`,
          project: "proj-a",
          signal_strength: 0.5, // above promotion_threshold
        })
      );
      if (i < 2 && entry) {
        store.setPinned(entry.id, true);
      }
    }

    const result = runEviction(store, "proj-a", config);
    expect(result.archived).toBe(2);
    // Pinned entries should still be active
    const active = store.countActiveByProject("proj-a");
    expect(active).toBe(10);
  });

  it("scopes eviction to specified project only", () => {
    for (let i = 0; i < 12; i++) {
      store.create(makeEntry({ session_id: `a${i}`, project: "proj-a" }));
    }
    store.create(makeEntry({ session_id: "b1", project: "proj-b" }));

    runEviction(store, "proj-a", config);
    // proj-b should be untouched
    expect(store.countActiveByProject("proj-b")).toBe(1);
  });
});

describe("ExperienceStore GC methods", () => {
  let store: ExperienceStore;

  beforeEach(async () => {
    store = await makeStore();
  });

  afterEach(() => {
    store.close();
  });

  it("updateRetrievalTracking increments count and sets timestamp", () => {
    const entry = store.create(makeEntry());
    expect(entry).not.toBeNull();

    store.updateRetrievalTracking(entry!.id);
    const updated = store.getById(entry!.id);
    expect(updated?.retrieval_count).toBe(1);
    expect(updated?.last_retrieved_at).toBeTruthy();

    store.updateRetrievalTracking(entry!.id);
    const updated2 = store.getById(entry!.id);
    expect(updated2?.retrieval_count).toBe(2);
  });

  it("adjustFeedbackScore adjusts by delta", () => {
    const entry = store.create(makeEntry());
    expect(entry).not.toBeNull();

    store.adjustFeedbackScore(entry!.id, 1);
    expect(store.getById(entry!.id)?.feedback_score).toBe(1);

    store.adjustFeedbackScore(entry!.id, 1);
    expect(store.getById(entry!.id)?.feedback_score).toBe(2);

    store.adjustFeedbackScore(entry!.id, -1);
    expect(store.getById(entry!.id)?.feedback_score).toBe(1);
  });

  it("setPinned sets and clears pin status", () => {
    const entry = store.create(makeEntry());
    expect(entry).not.toBeNull();

    const pinned = store.setPinned(entry!.id, true);
    expect(pinned).toBe(true);
    expect(store.getById(entry!.id)?.pinned).toBe(true);

    store.setPinned(entry!.id, false);
    expect(store.getById(entry!.id)?.pinned).toBeFalsy();
  });

  it("setPinned returns false for non-existent entry", () => {
    const result = store.setPinned("nonexistent-id", true);
    expect(result).toBe(false);
  });

  it("archive sets archived_at and excludes from active queries", () => {
    const entry = store.create(makeEntry({ project: "proj" }));
    expect(entry).not.toBeNull();

    const before = store.countActiveByProject("proj");
    expect(before).toBe(1);

    const archived = store.archive(entry!.id);
    expect(archived).toBe(true);

    const after = store.countActiveByProject("proj");
    expect(after).toBe(0);

    // Archived entries should not appear in getAllWithEmbedding
    const emb = new Float32Array([1, 0, 0]);
    store.createWithEmbedding(makeEntry({ session_id: "s2", project: "proj" }), emb);
    const withEmb = store.getAllWithEmbedding();
    expect(withEmb.every((e) => e.entry.id !== entry!.id)).toBe(true);
  });

  it("getEvictionCandidates returns lowest signal_strength unprotected entries", () => {
    const e1 = store.create(makeEntry({ session_id: "s1", project: "proj", signal_strength: 0.5 }));
    store.create(makeEntry({ session_id: "s2", project: "proj", signal_strength: 0.9 }));
    const e3 = store.create(makeEntry({ session_id: "s3", project: "proj", signal_strength: 0.6 }));

    expect(e1).not.toBeNull();
    expect(e3).not.toBeNull();

    const candidates = store.getEvictionCandidates("proj", 2);
    expect(candidates).toHaveLength(2);
    const ids = candidates.map((c) => c.id);
    expect(ids).toContain(e1!.id);
    expect(ids).toContain(e3!.id);
  });

  it("getEvictionCandidates excludes pinned entries", () => {
    const e1 = store.create(makeEntry({ session_id: "s1", project: "proj", signal_strength: 0.5 }));
    store.create(makeEntry({ session_id: "s2", project: "proj", signal_strength: 0.6 }));

    expect(e1).not.toBeNull();
    store.setPinned(e1!.id, true);

    const candidates = store.getEvictionCandidates("proj", 2);
    expect(candidates.every((c) => c.id !== e1!.id)).toBe(true);
  });

  it("getEvictionCandidates excludes high feedback_score entries", () => {
    const e1 = store.create(makeEntry({ session_id: "s1", project: "proj", signal_strength: 0.5 }));
    store.create(makeEntry({ session_id: "s2", project: "proj", signal_strength: 0.6 }));

    expect(e1).not.toBeNull();
    // Boost e1 above threshold
    store.adjustFeedbackScore(e1!.id, 3);

    const candidates = store.getEvictionCandidates("proj", 2);
    expect(candidates.every((c) => c.id !== e1!.id)).toBe(true);
  });

  it("getEvictionCandidates excludes insight type entries", () => {
    store.create(
      makeEntry({ session_id: "s1", project: "proj", signal_strength: 0.8, type: "insight" })
    );
    store.create(makeEntry({ session_id: "s2", project: "proj", signal_strength: 0.6 }));

    const candidates = store.getEvictionCandidates("proj", 2);
    expect(candidates.every((c) => c.type !== "insight")).toBe(true);
  });
});

describe("Retriever with recency and retrieval count", () => {
  let store: ExperienceStore;

  beforeEach(async () => {
    store = await makeStore();
  });

  afterEach(() => {
    store.close();
  });

  it("retrieval updates tracking for returned entries", async () => {
    const { Retriever } = await import("../../src/retrieval/retriever.js");
    const retriever = new Retriever(store, 30);
    const emb = new Float32Array([1, 0, 0]);
    const entry = store.createWithEmbedding(makeEntry(), emb);

    retriever.retrieve(new Float32Array([1, 0, 0]), 5);

    const updated = store.getById(entry!.id);
    expect(updated?.retrieval_count).toBe(1);
    expect(updated?.last_retrieved_at).toBeTruthy();
  });

  it("frequently retrieved entries get higher score via retrievalBoost", async () => {
    const { Retriever } = await import("../../src/retrieval/retriever.js");
    const retriever = new Retriever(store, 30);
    const emb = new Float32Array([1, 0, 0]);

    const e1 = store.createWithEmbedding(
      makeEntry({ session_id: "s1", signal_strength: 0.5 }),
      emb
    );
    store.createWithEmbedding(makeEntry({ session_id: "s2", signal_strength: 0.5 }), emb);

    // Simulate prior retrievals for e1
    for (let i = 0; i < 5; i++) {
      store.updateRetrievalTracking(e1!.id);
    }

    const results = retriever.retrieve(new Float32Array([1, 0, 0]), 2);
    // e1 should rank higher due to retrieval boost
    expect(results[0].entry.id).toBe(e1!.id);
  });
});
