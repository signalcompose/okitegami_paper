import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ExperienceManager } from "../experience-manager.js";

const TEST_DIR = join(import.meta.dirname ?? ".", "__test_results__");

describe("ExperienceManager", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("getDbPath", () => {
    it("returns a path under resultsDir based on condition/task/contextSize", () => {
      const mgr = new ExperienceManager(TEST_DIR);
      const dbPath = mgr.getDbPath("exp_001", "acm-sf", "task-a", "full");
      expect(dbPath).toBe(join(TEST_DIR, "exp_001", "acm-sf_task-a_full.db"));
    });
  });

  describe("generateExperience", () => {
    it("generates a success entry when completion_rate >= 0.8", () => {
      const mgr = new ExperienceManager(TEST_DIR);
      const entry = mgr.generateExperience({
        sessionId: "s1",
        completionRate: 1.0,
        taskDescription: "Fix JWT authentication bugs",
        claudeOutput: "Fixed token validation and middleware",
      });

      expect(entry).not.toBeNull();
      expect(entry!.type).toBe("success");
      expect(entry!.signal_strength).toBeCloseTo(1.0);
      expect(entry!.signal_type).toBe("uninterrupted_completion");
      expect(entry!.session_id).toBe("s1");
      expect(entry!.retrieval_keys.length).toBeGreaterThan(0);
    });

    it("generates a failure entry when completion_rate < 0.8", () => {
      const entry = new ExperienceManager(TEST_DIR).generateExperience({
        sessionId: "s2",
        completionRate: 0.4,
        taskDescription: "Fix JWT authentication bugs",
        claudeOutput: "Attempted fix but tests still fail",
      });

      expect(entry).not.toBeNull();
      expect(entry!.type).toBe("failure");
      expect(entry!.signal_strength).toBeCloseTo(0.4);
      expect(entry!.signal_type).toBe("uninterrupted_completion");
    });

    it("generates a failure entry with minimum strength when completion_rate is 0", () => {
      const entry = new ExperienceManager(TEST_DIR).generateExperience({
        sessionId: "s3",
        completionRate: 0.0,
        taskDescription: "Fix bugs",
        claudeOutput: "",
      });

      // promotion_threshold is 0.0 for experiments, and Math.max(0.0, 0.1) = 0.1
      expect(entry).not.toBeNull();
      expect(entry!.type).toBe("failure");
      expect(entry!.signal_strength).toBeCloseTo(0.1);
    });

    it("includes task description in trigger field", () => {
      const entry = new ExperienceManager(TEST_DIR).generateExperience({
        sessionId: "s4",
        completionRate: 0.9,
        taskDescription: "Fix JWT authentication bugs in multi-file project",
        claudeOutput: "Fixed all bugs",
      });

      expect(entry!.trigger).toContain("JWT");
    });

    it("includes claude output summary in action/outcome", () => {
      const entry = new ExperienceManager(TEST_DIR).generateExperience({
        sessionId: "s5",
        completionRate: 0.5,
        taskDescription: "Fix bugs",
        claudeOutput: "Modified jwt-validator.ts to fix token expiry check",
      });

      expect(entry!.action).toContain("jwt-validator");
    });
  });

  describe("storeExperience / retrieveInjection", () => {
    it("stores and retrieves experiences from a shared DB", () => {
      const mgr = new ExperienceManager(TEST_DIR);
      const dbPath = mgr.getDbPath("exp_test", "acm-sf", "task-a", "full");

      // Store a success experience
      const entry = mgr.generateExperience({
        sessionId: "s1",
        completionRate: 1.0,
        taskDescription: "Fix JWT authentication bugs",
        claudeOutput: "Fixed token validation logic",
      });
      expect(entry).not.toBeNull();

      const stored = mgr.storeExperience(dbPath, entry!);
      expect(stored).not.toBeNull();
      expect(stored!.id).toBeTruthy();

      mgr.closeAll();
    });

    it("accumulates experiences across multiple sessions", () => {
      const mgr = new ExperienceManager(TEST_DIR);
      const dbPath = mgr.getDbPath("exp_acc", "acm-sf", "task-a", "full");

      // Session 1
      const e1 = mgr.generateExperience({
        sessionId: "s1",
        completionRate: 0.5,
        taskDescription: "Fix JWT authentication bugs",
        claudeOutput: "Partially fixed",
      });
      mgr.storeExperience(dbPath, e1!);

      // Session 2
      const e2 = mgr.generateExperience({
        sessionId: "s2",
        completionRate: 1.0,
        taskDescription: "Fix JWT authentication bugs",
        claudeOutput: "Fixed all bugs",
      });
      mgr.storeExperience(dbPath, e2!);

      // Verify DB has both
      const store = mgr.getStore(dbPath);
      const all = store.list();
      expect(all).toHaveLength(2);

      mgr.closeAll();
    });

    it("retrieves injection text for accumulated experiences", () => {
      const mgr = new ExperienceManager(TEST_DIR);
      const dbPath = mgr.getDbPath("exp_inject", "acm-sf", "task-a", "full");

      // Store experiences
      const e1 = mgr.generateExperience({
        sessionId: "s1",
        completionRate: 1.0,
        taskDescription: "Fix JWT authentication bugs",
        claudeOutput: "Fixed token validation",
      });
      mgr.storeExperience(dbPath, e1!);

      // Retrieve injection
      const injection = mgr.retrieveInjection(dbPath, "Fix JWT authentication bugs");

      // Should contain ACM Context header and experience data
      expect(injection).toContain("[ACM Context]");
      expect(injection).toContain("SUCCESS");

      mgr.closeAll();
    });

    it("returns empty injection when no experiences exist", () => {
      const mgr = new ExperienceManager(TEST_DIR);
      const dbPath = mgr.getDbPath("exp_empty", "acm-sf", "task-a", "full");

      const injection = mgr.retrieveInjection(dbPath, "Fix bugs");
      expect(injection).toBe("");

      mgr.closeAll();
    });

    it("returns empty injection for control condition (disabled mode)", () => {
      const mgr = new ExperienceManager(TEST_DIR);
      // Control DB path — the manager should know control doesn't inject
      const dbPath = mgr.getDbPath("exp_ctrl", "control", "task-a", "full");

      // Even if we somehow store something, control shouldn't retrieve
      const injection = mgr.retrieveInjection(dbPath, "Fix bugs", "control");
      expect(injection).toBe("");

      mgr.closeAll();
    });
  });

  describe("DB lifecycle", () => {
    it("creates DB directory if needed", () => {
      const mgr = new ExperienceManager(TEST_DIR);
      const dbPath = mgr.getDbPath("exp_new", "acm-sf", "task-a", "full");

      mgr.storeExperience(
        dbPath,
        mgr.generateExperience({
          sessionId: "s1",
          completionRate: 1.0,
          taskDescription: "Test",
          claudeOutput: "Done",
        })!
      );

      expect(existsSync(dbPath)).toBe(true);
      mgr.closeAll();
    });

    it("reuses store instance for same DB path", () => {
      const mgr = new ExperienceManager(TEST_DIR);
      const dbPath = mgr.getDbPath("exp_reuse", "acm-sf", "task-a", "full");

      const store1 = mgr.getStore(dbPath);
      const store2 = mgr.getStore(dbPath);
      expect(store1).toBe(store2);

      mgr.closeAll();
    });
  });
});
