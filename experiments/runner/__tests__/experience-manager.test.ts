import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ExperienceManager, extractFailedTests, stripCviContent } from "../experience-manager.js";

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

    it("classifies completionRate exactly 0.8 as success", () => {
      const entry = new ExperienceManager(TEST_DIR).generateExperience({
        sessionId: "s-boundary",
        completionRate: 0.8,
        taskDescription: "Boundary test",
        claudeOutput: "Done",
      });
      expect(entry!.type).toBe("success");
      expect(entry!.signal_strength).toBeCloseTo(0.8);
    });

    it("classifies completionRate 0.79 as failure", () => {
      const entry = new ExperienceManager(TEST_DIR).generateExperience({
        sessionId: "s-boundary-low",
        completionRate: 0.79,
        taskDescription: "Boundary test",
        claudeOutput: "Partially done",
      });
      expect(entry!.type).toBe("failure");
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
    it("stores and retrieves experiences from a shared DB", async () => {
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

      const stored = await mgr.storeExperience(dbPath, entry!);
      expect(stored).not.toBeNull();
      expect(stored!.id).toBeTruthy();

      mgr.closeAll();
    });

    it("accumulates experiences across multiple sessions", async () => {
      const mgr = new ExperienceManager(TEST_DIR);
      const dbPath = mgr.getDbPath("exp_acc", "acm-sf", "task-a", "full");

      // Session 1
      const e1 = mgr.generateExperience({
        sessionId: "s1",
        completionRate: 0.5,
        taskDescription: "Fix JWT authentication bugs",
        claudeOutput: "Partially fixed",
      });
      await mgr.storeExperience(dbPath, e1!);

      // Session 2
      const e2 = mgr.generateExperience({
        sessionId: "s2",
        completionRate: 1.0,
        taskDescription: "Fix JWT authentication bugs",
        claudeOutput: "Fixed all bugs",
      });
      await mgr.storeExperience(dbPath, e2!);

      // Verify DB has both
      const store = await mgr.getStore(dbPath);
      const all = store.list();
      expect(all).toHaveLength(2);

      mgr.closeAll();
    });

    it("retrieves injection text for accumulated experiences", async () => {
      const mgr = new ExperienceManager(TEST_DIR);
      const dbPath = mgr.getDbPath("exp_inject", "acm-sf", "task-a", "full");

      // Store experiences
      const e1 = mgr.generateExperience({
        sessionId: "s1",
        completionRate: 1.0,
        taskDescription: "Fix JWT authentication bugs",
        claudeOutput: "Fixed token validation",
      });
      await mgr.storeExperience(dbPath, e1!);

      // Retrieve injection
      const injection = await mgr.retrieveInjection(dbPath, "Fix JWT authentication bugs");

      // Should contain ACM Context header and experience data
      expect(injection).toContain("[ACM Context]");
      expect(injection).toContain("SUCCESS");

      mgr.closeAll();
    });

    it("returns empty injection when no experiences exist", async () => {
      const mgr = new ExperienceManager(TEST_DIR);
      const dbPath = mgr.getDbPath("exp_empty", "acm-sf", "task-a", "full");

      const injection = await mgr.retrieveInjection(dbPath, "Fix bugs");
      expect(injection).toBe("");

      mgr.closeAll();
    });

    it("returns empty injection for control condition (disabled mode)", async () => {
      const mgr = new ExperienceManager(TEST_DIR);
      const dbPath = mgr.getDbPath("exp_ctrl", "control", "task-a", "full");

      const injection = await mgr.retrieveInjection(dbPath, "Fix bugs", "control");
      expect(injection).toBe("");

      mgr.closeAll();
    });

    it("returns empty injection for baseline-compact condition", async () => {
      const mgr = new ExperienceManager(TEST_DIR);
      const dbPath = mgr.getDbPath("exp_bc", "baseline-compact", "task-a", "full");

      const injection = await mgr.retrieveInjection(dbPath, "Fix bugs", "baseline-compact");
      expect(injection).toBe("");

      mgr.closeAll();
    });
  });

  describe("extractFailedTests", () => {
    it("extracts failed test names from vitest JSON output", () => {
      const vitestJson = JSON.stringify({
        numTotalTests: 8,
        numPassedTests: 6,
        numFailedTests: 2,
        testResults: [
          {
            name: "auth.test.ts",
            status: "failed",
            assertionResults: [
              {
                fullName: "auth > validates token expiry",
                status: "failed",
                failureMessages: ["Expected true"],
              },
              { fullName: "auth > checks signature", status: "passed" },
            ],
          },
          {
            name: "middleware.test.ts",
            status: "failed",
            assertionResults: [
              {
                fullName: "middleware > rejects invalid token",
                status: "failed",
                failureMessages: ["Timeout"],
              },
            ],
          },
        ],
      });
      const failed = extractFailedTests(vitestJson);
      expect(failed).toEqual([
        "auth > validates token expiry",
        "middleware > rejects invalid token",
      ]);
    });

    it("returns empty array when all tests pass", () => {
      const vitestJson = JSON.stringify({
        numTotalTests: 3,
        numPassedTests: 3,
        numFailedTests: 0,
        testResults: [
          {
            name: "auth.test.ts",
            status: "passed",
            assertionResults: [{ fullName: "auth > works", status: "passed" }],
          },
        ],
      });
      expect(extractFailedTests(vitestJson)).toEqual([]);
    });

    it("returns empty array for invalid JSON", () => {
      expect(extractFailedTests("not valid json")).toEqual([]);
    });

    it("returns empty array for empty string", () => {
      expect(extractFailedTests("")).toEqual([]);
    });

    it("truncates to 5 failed test names", () => {
      const results = Array.from({ length: 10 }, (_, i) => ({
        name: `test${i}.ts`,
        status: "failed" as const,
        assertionResults: [
          { fullName: `test ${i} > fails`, status: "failed" as const, failureMessages: ["err"] },
        ],
      }));
      const vitestJson = JSON.stringify({
        numTotalTests: 10,
        numPassedTests: 0,
        numFailedTests: 10,
        testResults: results,
      });
      const failed = extractFailedTests(vitestJson);
      expect(failed).toHaveLength(5);
    });
  });

  describe("stripCviContent", () => {
    it("removes Voice: pattern", () => {
      const input = 'Voice: "Task completed successfully." Fixed the bug in jwt.ts';
      expect(stripCviContent(input)).toBe("Fixed the bug in jwt.ts");
    });

    it("removes [VOICE] tags", () => {
      const input = "[VOICE]Task done.[/VOICE] Modified the auth module.";
      expect(stripCviContent(input)).toBe("Modified the auth module.");
    });

    it("removes multiline [VOICE] tags", () => {
      const input = "[VOICE]Task\ncompleted\nsuccessfully.[/VOICE]\nFixed jwt.ts";
      expect(stripCviContent(input)).toBe("Fixed jwt.ts");
    });

    it("handles text without CVI content", () => {
      const input = "Fixed all authentication bugs";
      expect(stripCviContent(input)).toBe("Fixed all authentication bugs");
    });

    it("handles empty string", () => {
      expect(stripCviContent("")).toBe("");
    });

    it("removes multiple CVI patterns", () => {
      const input = 'Voice: "Done." [VOICE]Also done[/VOICE] Real output here.';
      expect(stripCviContent(input)).toBe("Real output here.");
    });

    it("removes single-quoted Voice pattern", () => {
      const input = "Voice: 'Task completed.' Fixed the bug in jwt.ts";
      expect(stripCviContent(input)).toBe("Fixed the bug in jwt.ts");
    });
  });

  describe("generateExperience with vitestOutput", () => {
    it("includes failed test names in outcome when vitestOutput is provided", () => {
      const mgr = new ExperienceManager(TEST_DIR);
      const vitestJson = JSON.stringify({
        numTotalTests: 8,
        numPassedTests: 6,
        numFailedTests: 2,
        testResults: [
          {
            name: "auth.test.ts",
            status: "failed",
            assertionResults: [
              {
                fullName: "auth > validates token expiry",
                status: "failed",
                failureMessages: ["Expected true"],
              },
            ],
          },
          {
            name: "middleware.test.ts",
            status: "passed",
            assertionResults: [{ fullName: "middleware > works", status: "passed" }],
          },
        ],
      });

      const entry = mgr.generateExperience({
        sessionId: "s-vt",
        completionRate: 0.75,
        taskDescription: "Fix JWT bugs",
        claudeOutput: "Attempted fix",
        vitestOutput: vitestJson,
      });

      expect(entry).not.toBeNull();
      expect(entry!.outcome).toContain("auth > validates token expiry");
      expect(entry!.outcome).toContain("6/8");
    });

    it("generates success outcome with test count when all pass", () => {
      const mgr = new ExperienceManager(TEST_DIR);
      const vitestJson = JSON.stringify({
        numTotalTests: 8,
        numPassedTests: 8,
        numFailedTests: 0,
        testResults: [
          {
            name: "auth.test.ts",
            status: "passed",
            assertionResults: [{ fullName: "auth > works", status: "passed" }],
          },
        ],
      });

      const entry = mgr.generateExperience({
        sessionId: "s-vt-ok",
        completionRate: 1.0,
        taskDescription: "Fix bugs",
        claudeOutput: "Done",
        vitestOutput: vitestJson,
      });

      expect(entry!.outcome).toContain("All tests passed");
      expect(entry!.outcome).toContain("8/8");
    });

    it("falls back to generic outcome when vitestOutput is not provided", () => {
      const mgr = new ExperienceManager(TEST_DIR);
      const entry = mgr.generateExperience({
        sessionId: "s-no-vt",
        completionRate: 0.5,
        taskDescription: "Fix bugs",
        claudeOutput: "Tried",
      });

      expect(entry!.outcome).toBe("Task incomplete: 50% test pass rate");
    });

    it("falls back to generic outcome when vitestOutput is invalid JSON", () => {
      const mgr = new ExperienceManager(TEST_DIR);
      const entry = mgr.generateExperience({
        sessionId: "s-bad-vt",
        completionRate: 0.5,
        taskDescription: "Fix bugs",
        claudeOutput: "Tried",
        vitestOutput: "invalid json",
      });

      expect(entry!.outcome).toBe("Task incomplete: 50% test pass rate");
    });

    it("strips CVI content from claudeOutput before using in action", () => {
      const mgr = new ExperienceManager(TEST_DIR);
      const entry = mgr.generateExperience({
        sessionId: "s-cvi",
        completionRate: 0.5,
        taskDescription: "Fix bugs",
        claudeOutput: 'Voice: "Task completed." Fixed the authentication module',
      });

      expect(entry!.action).not.toContain("Voice:");
      expect(entry!.action).toContain("authentication module");
    });
  });

  describe("DB lifecycle", () => {
    it("creates DB directory if needed", async () => {
      const mgr = new ExperienceManager(TEST_DIR);
      const dbPath = mgr.getDbPath("exp_new", "acm-sf", "task-a", "full");

      await mgr.storeExperience(
        dbPath,
        mgr.generateExperience({
          sessionId: "s1",
          completionRate: 1.0,
          taskDescription: "Test",
          claudeOutput: "Done",
        })!
      );

      // sql.js writes file on close(), not on insert
      mgr.closeAll();
      expect(existsSync(dbPath)).toBe(true);
    });

    it("reuses store instance for same DB path", async () => {
      const mgr = new ExperienceManager(TEST_DIR);
      const dbPath = mgr.getDbPath("exp_reuse", "acm-sf", "task-a", "full");

      const store1 = await mgr.getStore(dbPath);
      const store2 = await mgr.getStore(dbPath);
      expect(store1).toBe(store2);

      mgr.closeAll();
    });
  });
});
