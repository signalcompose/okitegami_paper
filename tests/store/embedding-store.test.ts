import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ExperienceStore } from "../../src/store/experience-store.js";
import { serializeEmbedding, deserializeEmbedding } from "../../src/retrieval/embedding-serde.js";
import { makeEntry, makeStore } from "../retrieval/helpers.js";

describe("ExperienceStore embedding support", () => {
  let store: ExperienceStore;

  beforeEach(async () => {
    store = await makeStore();
  });

  afterEach(() => {
    store.close();
  });

  describe("serializeEmbedding / deserializeEmbedding", () => {
    it("round-trips a Float32Array through Buffer", () => {
      const original = new Float32Array([0.1, 0.2, 0.3, -0.5]);
      const buf = serializeEmbedding(original);
      expect(buf).toBeInstanceOf(Buffer);
      const restored = deserializeEmbedding(buf);
      expect(restored.length).toBe(4);
      for (let i = 0; i < original.length; i++) {
        expect(restored[i]).toBeCloseTo(original[i], 5);
      }
    });

    it("throws for blob with byte length not a multiple of 4", () => {
      const buf = Buffer.from([0x01, 0x02, 0x03]);
      expect(() => deserializeEmbedding(buf)).toThrow("not a multiple of 4");
    });

    it("throws when dimensions do not match expected", () => {
      const small = new Float32Array([0.1, 0.2]);
      const buf = serializeEmbedding(small);
      expect(() => deserializeEmbedding(buf, 384)).toThrow("2 dimensions, expected 384");
    });

    it("handles 384-dimensional embedding", () => {
      const original = new Float32Array(384);
      for (let i = 0; i < 384; i++) original[i] = Math.random() * 2 - 1;
      const buf = serializeEmbedding(original);
      const restored = deserializeEmbedding(buf);
      expect(restored.length).toBe(384);
      for (let i = 0; i < 384; i++) {
        expect(restored[i]).toBeCloseTo(original[i], 5);
      }
    });
  });

  describe("create with embedding", () => {
    it("stores and retrieves embedding via createWithEmbedding", () => {
      const embedding = new Float32Array([0.1, 0.2, 0.3]);
      const entry = store.createWithEmbedding(makeEntry(), embedding);
      expect(entry).not.toBeNull();

      const retrieved = store.getById(entry!.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.trigger).toBe("Fix bug in auth module");
    });

    it("backward compatible: entries without embedding are still retrieved", () => {
      const entry = store.create(makeEntry());
      expect(entry).not.toBeNull();
      const retrieved = store.getById(entry!.id);
      expect(retrieved).not.toBeNull();
    });
  });

  describe("updateEmbedding", () => {
    it("updates an existing entry's embedding", () => {
      const entry = store.create(makeEntry());
      expect(entry).not.toBeNull();

      const embedding = new Float32Array([0.5, 0.5, 0.5]);
      const updated = store.updateEmbedding(entry!.id, embedding);
      expect(updated).toBe(true);
    });

    it("returns false for non-existent id", () => {
      const embedding = new Float32Array([0.5, 0.5, 0.5]);
      const updated = store.updateEmbedding("non-existent", embedding);
      expect(updated).toBe(false);
    });
  });

  describe("getAllWithEmbedding", () => {
    it("returns only entries that have embeddings", () => {
      store.create(makeEntry({ session_id: "no-emb" }));

      const embedding = new Float32Array([0.1, 0.2, 0.3]);
      store.createWithEmbedding(makeEntry({ session_id: "has-emb" }), embedding);

      const results = store.getAllWithEmbedding();
      expect(results).toHaveLength(1);
      expect(results[0].entry.session_id).toBe("has-emb");
      expect(results[0].embedding).toBeInstanceOf(Float32Array);
      expect(results[0].embedding.length).toBe(3);
    });

    it("returns empty array when no entries have embeddings", () => {
      store.create(makeEntry());
      const results = store.getAllWithEmbedding();
      expect(results).toHaveLength(0);
    });

    it("filters by mode: success_only", async () => {
      const successStore = await makeStore({ mode: "success_only" });
      const emb = new Float32Array([0.1]);

      successStore.createWithEmbedding(makeEntry({ type: "success" }), emb);
      successStore.createWithEmbedding(
        makeEntry({
          type: "failure",
          signal_type: "interrupt_with_dialogue",
          signal_strength: 0.9,
        }),
        emb
      );

      const results = successStore.getAllWithEmbedding();
      expect(results).toHaveLength(1);
      expect(results[0].entry.type).toBe("success");
      successStore.close();
    });

    it("filters by mode: failure_only", async () => {
      const failStore = await makeStore({ mode: "failure_only" });
      const emb = new Float32Array([0.1]);

      failStore.createWithEmbedding(makeEntry({ type: "success" }), emb);
      failStore.createWithEmbedding(
        makeEntry({
          type: "failure",
          signal_type: "interrupt_with_dialogue",
          signal_strength: 0.9,
        }),
        emb
      );

      const results = failStore.getAllWithEmbedding();
      expect(results).toHaveLength(1);
      expect(results[0].entry.type).toBe("failure");
      failStore.close();
    });

    it("skips corrupt embedding rows without crashing", () => {
      // Insert a valid entry with correct 384-dim embedding
      const goodEmb = new Float32Array(384);
      goodEmb[0] = 0.5;
      store.createWithEmbedding(makeEntry({ session_id: "good" }), goodEmb);

      // Manually insert a corrupt embedding (invalid byte length) via raw SQL
      const corruptBuf = Buffer.from([0x01, 0x02, 0x03]); // 3 bytes, not multiple of 4
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing private db for test setup
      const db = (store as any).db;
      db.prepare(
        `INSERT INTO experiences
         (id, type, trigger_text, action_text, outcome_text,
          retrieval_keys, signal_strength, signal_type,
          session_id, timestamp, interrupt_context, embedding)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "corrupt-id",
        "success",
        "trigger",
        "action",
        "outcome",
        '["key"]',
        0.8,
        "uninterrupted_completion",
        "corrupt-session",
        new Date().toISOString(),
        null,
        corruptBuf
      );

      // Should return only the good entry, skipping corrupt
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const results = store.getAllWithEmbedding();
      expect(results).toHaveLength(1);
      expect(results[0].entry.session_id).toBe("good");
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("corrupt-id"));
      warnSpy.mockRestore();
    });

    it("returns empty for disabled mode", async () => {
      const disabledStore = await makeStore({ mode: "disabled" });
      const emb = new Float32Array([0.1]);
      disabledStore.createWithEmbedding(makeEntry(), emb);

      const results = disabledStore.getAllWithEmbedding();
      expect(results).toHaveLength(0);
      disabledStore.close();
    });
  });
});
