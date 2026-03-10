import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const TASK_DIR = resolve(import.meta.dirname ?? ".", "../../experiments/tasks/task-b-feature");

describe("Task B Validation", () => {
  describe("file structure", () => {
    it("has all required files", () => {
      const required = [
        "package.json",
        "tsconfig.json",
        "vitest.config.ts",
        "TASK.md",
        "SOLUTION.md",
        "reset.sh",
        "src/models/user.ts",
        "src/models/notification.ts",
        "src/services/user-service.ts",
        "src/services/notification-service.ts",
        "src/services/transport.ts",
        "src/api/user-api.ts",
        "src/index.ts",
        "tests/user-service.test.ts",
        "tests/notification.test.ts",
      ];
      for (const file of required) {
        expect(existsSync(resolve(TASK_DIR, file)), `Missing: ${file}`).toBe(true);
      }
    });

    it("reset.sh contains git checkout command", () => {
      const content = readFileSync(resolve(TASK_DIR, "reset.sh"), "utf-8");
      expect(content).toContain("git checkout -- src/ tests/");
    });
  });

  describe("initial state: stubs require implementation", () => {
    it("notification-service.ts is a stub with empty class", () => {
      const src = readFileSync(resolve(TASK_DIR, "src/services/notification-service.ts"), "utf-8");
      // Should be a minimal stub class with TODO comment
      expect(src).toContain("TODO");
      expect(src).toContain("class NotificationService");
      // Should NOT have a constructor with parameters (not yet implemented)
      expect(src).not.toMatch(/constructor\s*\(/);
      // Should NOT have subscribe/unsubscribe/emit methods
      expect(src).not.toContain("subscribe(");
      expect(src).not.toContain("emit(");
    });

    it("transport.ts has TransportAdapter interface but no ConsoleTransport", () => {
      const src = readFileSync(resolve(TASK_DIR, "src/services/transport.ts"), "utf-8");
      // Interface should be defined
      expect(src).toContain("export interface TransportAdapter");
      expect(src).toContain("send(");
      // ConsoleTransport should NOT be implemented yet
      expect(src).not.toContain("class ConsoleTransport");
      // Should have a TODO indicating implementation is needed
      expect(src).toContain("TODO");
    });

    it("notification model defines Notification interface but no NotificationStore", () => {
      const src = readFileSync(resolve(TASK_DIR, "src/models/notification.ts"), "utf-8");
      // Interface should be defined
      expect(src).toContain("export interface Notification");
      expect(src).toContain("recipient");
      expect(src).toContain("status");
      // NotificationStore should NOT be implemented yet
      expect(src).not.toContain("class NotificationStore");
    });
  });

  describe("specification", () => {
    it("TASK.md contains the feature specification", () => {
      const task = readFileSync(resolve(TASK_DIR, "TASK.md"), "utf-8");
      expect(task).toContain("NotificationService");
      expect(task).toContain("TransportAdapter");
      expect(task).toContain("ConsoleTransport");
      expect(task).toContain("NotificationStore");
      // Specifies the three methods
      expect(task).toContain("subscribe");
      expect(task).toContain("unsubscribe");
      expect(task).toContain("emit");
      // Specifies UserService integration
      expect(task).toContain("UserService");
      expect(task).toContain("user_created");
      expect(task).toContain("user_updated");
      expect(task).toContain("user_deleted");
    });
  });

  describe("solution validity", () => {
    it("SOLUTION.md contains reference implementation for all components", () => {
      const solution = readFileSync(resolve(TASK_DIR, "SOLUTION.md"), "utf-8");
      // NotificationStore implementation
      expect(solution).toContain("class NotificationStore");
      expect(solution).toContain("getByRecipient");
      expect(solution).toContain("updateStatus");
      // ConsoleTransport implementation
      expect(solution).toContain("class ConsoleTransport");
      expect(solution).toContain("implements TransportAdapter");
      // NotificationService implementation
      expect(solution).toContain("class NotificationService");
      expect(solution).toContain("subscribe(");
      expect(solution).toContain("unsubscribe(");
      expect(solution).toContain("emit(");
    });

    it("SOLUTION.md specifies expected test count", () => {
      const solution = readFileSync(resolve(TASK_DIR, "SOLUTION.md"), "utf-8");
      // Should mention 12 tests total (4 user-service + 8 notification)
      expect(solution).toContain("12 tests");
    });
  });

  describe("test suite", () => {
    it("notification.test.ts has 8 test cases", () => {
      const testSrc = readFileSync(resolve(TASK_DIR, "tests/notification.test.ts"), "utf-8");
      const testCount = (testSrc.match(/\bit\s*\(/g) || []).length;
      expect(testCount).toBe(8);
    });

    it("notification.test.ts imports NotificationStore and ConsoleTransport", () => {
      const testSrc = readFileSync(resolve(TASK_DIR, "tests/notification.test.ts"), "utf-8");
      // Tests expect these to be importable after implementation
      expect(testSrc).toContain("NotificationStore");
      expect(testSrc).toContain("ConsoleTransport");
      expect(testSrc).toContain("NotificationService");
    });

    it("notification.test.ts covers subscribe, emit, unsubscribe, and failure", () => {
      const testSrc = readFileSync(resolve(TASK_DIR, "tests/notification.test.ts"), "utf-8");
      expect(testSrc).toContain("subscribe");
      expect(testSrc).toContain("unsubscribe");
      expect(testSrc).toContain("emit");
      expect(testSrc).toContain("failed");
    });

    it("user-service.test.ts exists", () => {
      expect(existsSync(resolve(TASK_DIR, "tests/user-service.test.ts"))).toBe(true);
    });
  });
});
