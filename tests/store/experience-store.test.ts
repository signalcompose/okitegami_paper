import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ExperienceStore } from "../../src/store/experience-store.js";
import { makeEntry, makeConfig } from "../retrieval/helpers.js";

describe("ExperienceStore", () => {
  let store: ExperienceStore;

  beforeEach(() => {
    store = new ExperienceStore(makeConfig());
  });

  afterEach(() => {
    store.close();
  });

  describe("create", () => {
    it("creates an entry and returns it with a generated id", () => {
      const entry = store.create(makeEntry());
      expect(entry).not.toBeNull();
      expect(entry!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(entry!.type).toBe("success");
      expect(entry!.trigger).toBe("Fix bug in auth module");
    });

    it("stores retrieval_keys as JSON", () => {
      const entry = store.create(makeEntry());
      expect(entry).not.toBeNull();
      const retrieved = store.getById(entry!.id);
      expect(retrieved?.retrieval_keys).toEqual(["auth", "null-token", "bug-fix"]);
    });

    it("stores interrupt_context for failure entries", () => {
      const entry = store.create(
        makeEntry({
          type: "failure",
          signal_type: "interrupt_with_dialogue",
          signal_strength: 0.95,
          interrupt_context: {
            turns_captured: 3,
            dialogue_summary: "Wrong file was edited",
          },
        })
      );
      expect(entry).not.toBeNull();

      const retrieved = store.getById(entry!.id);
      expect(retrieved?.interrupt_context).toEqual({
        turns_captured: 3,
        dialogue_summary: "Wrong file was edited",
      });
    });
  });

  describe("validation", () => {
    it("throws on signal_strength out of range", () => {
      expect(() => store.create(makeEntry({ signal_strength: 1.5 }))).toThrow(
        "signal_strength must be between 0 and 1"
      );

      expect(() => store.create(makeEntry({ signal_strength: -0.1 }))).toThrow(
        "signal_strength must be between 0 and 1"
      );
    });

    it("throws on invalid signal_type", () => {
      expect(() =>
        store.create(makeEntry({ signal_type: "invalid_type" as ExperienceEntry["signal_type"] }))
      ).toThrow("Invalid signal_type");
    });
  });

  describe("getById", () => {
    it("returns null for non-existent id", () => {
      const result = store.getById("non-existent-id");
      expect(result).toBeNull();
    });

    it("returns the correct entry", () => {
      const created = store.create(makeEntry());
      expect(created).not.toBeNull();
      const retrieved = store.getById(created!.id);
      expect(retrieved).toEqual(created);
    });
  });

  describe("list", () => {
    it("returns empty array when no entries exist", () => {
      expect(store.list()).toEqual([]);
    });

    it("returns all entries ordered by timestamp desc", () => {
      store.create(makeEntry({ timestamp: "2026-01-01T00:00:00Z" }));
      store.create(makeEntry({ timestamp: "2026-01-03T00:00:00Z" }));
      store.create(makeEntry({ timestamp: "2026-01-02T00:00:00Z" }));

      const entries = store.list();
      expect(entries).toHaveLength(3);
      expect(entries[0].timestamp).toBe("2026-01-03T00:00:00Z");
      expect(entries[1].timestamp).toBe("2026-01-02T00:00:00Z");
      expect(entries[2].timestamp).toBe("2026-01-01T00:00:00Z");
    });

    it("supports limit parameter", () => {
      store.create(makeEntry({ timestamp: "2026-01-01T00:00:00Z" }));
      store.create(makeEntry({ timestamp: "2026-01-02T00:00:00Z" }));
      store.create(makeEntry({ timestamp: "2026-01-03T00:00:00Z" }));

      const entries = store.list({ limit: 2 });
      expect(entries).toHaveLength(2);
    });
  });

  describe("delete", () => {
    it("deletes an existing entry", () => {
      const entry = store.create(makeEntry());
      expect(entry).not.toBeNull();
      const deleted = store.delete(entry!.id);
      expect(deleted).toBe(true);
      expect(store.getById(entry!.id)).toBeNull();
    });

    it("returns false for non-existent id", () => {
      expect(store.delete("non-existent")).toBe(false);
    });
  });

  describe("mode filtering", () => {
    it("filters to success entries only in success_only mode", () => {
      const successStore = new ExperienceStore(makeConfig({ mode: "success_only" }));
      successStore.create(makeEntry({ type: "success" }));
      successStore.create(
        makeEntry({
          type: "failure",
          signal_type: "interrupt_with_dialogue",
          signal_strength: 0.9,
        })
      );

      const entries = successStore.listByMode();
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("success");
      successStore.close();
    });

    it("filters to failure entries only in failure_only mode", () => {
      const failureStore = new ExperienceStore(makeConfig({ mode: "failure_only" }));
      failureStore.create(makeEntry({ type: "success" }));
      failureStore.create(
        makeEntry({
          type: "failure",
          signal_type: "interrupt_with_dialogue",
          signal_strength: 0.9,
        })
      );

      const entries = failureStore.listByMode();
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("failure");
      failureStore.close();
    });

    it("returns both types in full mode", () => {
      store.create(makeEntry({ type: "success" }));
      store.create(
        makeEntry({
          type: "failure",
          signal_type: "interrupt_with_dialogue",
          signal_strength: 0.9,
        })
      );

      const entries = store.listByMode();
      expect(entries).toHaveLength(2);
    });

    it("returns empty in disabled mode", () => {
      const disabledStore = new ExperienceStore(makeConfig({ mode: "disabled" }));
      disabledStore.create(makeEntry({ type: "success" }));

      const entries = disabledStore.listByMode();
      expect(entries).toHaveLength(0);
      disabledStore.close();
    });
  });

  describe("promotion threshold", () => {
    it("does not persist entries below promotion_threshold", () => {
      const strictStore = new ExperienceStore(makeConfig({ promotion_threshold: 0.5 }));

      const entry = strictStore.create(makeEntry({ signal_strength: 0.3 }));

      expect(entry).toBeNull();
      expect(strictStore.list()).toHaveLength(0);
      strictStore.close();
    });

    it("persists entries at or above promotion_threshold", () => {
      const strictStore = new ExperienceStore(makeConfig({ promotion_threshold: 0.5 }));

      const entry = strictStore.create(makeEntry({ signal_strength: 0.5 }));

      expect(entry).not.toBeNull();
      expect(entry!.signal_strength).toBe(0.5);
      strictStore.close();
    });
  });
});
