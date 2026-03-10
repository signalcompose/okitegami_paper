import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const TASK_DIR = resolve(import.meta.dirname ?? ".", "../../experiments/tasks/task-a-bugfix");

describe("Task A Validation", () => {
  describe("file structure", () => {
    it("has all required files", () => {
      const required = [
        "package.json",
        "tsconfig.json",
        "vitest.config.ts",
        "TASK.md",
        "SOLUTION.md",
        "reset.sh",
        "src/auth/jwt-validator.ts",
        "src/auth/token-store.ts",
        "src/auth/middleware.ts",
        "src/api/routes.ts",
        "src/api/handlers.ts",
        "src/utils/config.ts",
        "src/utils/logger.ts",
        "src/index.ts",
        "tests/auth.test.ts",
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

  describe("seeded bugs", () => {
    it("Bug 1: jwt-validator uses >= instead of > for expiry check", () => {
      const src = readFileSync(resolve(TASK_DIR, "src/auth/jwt-validator.ts"), "utf-8");
      // The bug: `payload.exp >= nowSeconds` treats exp === now as valid.
      // Correct behavior: `payload.exp > nowSeconds` — token at exact expiry should be invalid.
      expect(src).toContain("payload.exp >= nowSeconds");
    });

    it("Bug 2: token-store uses > instead of >= for TTL boundary check", () => {
      const src = readFileSync(resolve(TASK_DIR, "src/auth/token-store.ts"), "utf-8");
      // The bug: `Date.now() > entry.expiresAt` returns value when Date.now() === expiresAt.
      // Correct behavior: `Date.now() >= entry.expiresAt` — entry at exact expiry should be expired.
      expect(src).toContain("Date.now() > entry.expiresAt");
      // Verify the correct version is NOT present (confirming the bug exists)
      expect(src).not.toMatch(/Date\.now\(\)\s*>=\s*entry\.expiresAt/);
    });

    it("Bug 3: middleware returns 401 instead of 403 for expired tokens", () => {
      const src = readFileSync(resolve(TASK_DIR, "src/auth/middleware.ts"), "utf-8");
      // The bug: expired token handler returns status 401 (Unauthorized).
      // Correct behavior: should return 403 (Forbidden) for expired tokens.
      // Find the expired-token block: after `result.error === "Token has expired"`
      const expiredBlock = src.slice(src.indexOf('result.error === "Token has expired"'));
      expect(expiredBlock).toBeDefined();
      // The bug: status 401 in the expired token block
      expect(expiredBlock).toMatch(/status:\s*401/);
    });
  });

  describe("solution validity", () => {
    it("SOLUTION.md documents all three bug fixes", () => {
      const solution = readFileSync(resolve(TASK_DIR, "SOLUTION.md"), "utf-8");
      expect(solution).toContain("jwt-validator");
      expect(solution).toContain("token-store");
      expect(solution).toContain("middleware");
      // Documents the >= to > fix for jwt-validator
      expect(solution).toContain("payload.exp > nowSeconds");
      // Documents the > to >= fix for token-store
      expect(solution).toContain("Date.now() >= entry.expiresAt");
      // Documents the 401 to 403 fix for middleware
      expect(solution).toContain("403");
    });

    it("SOLUTION.md shows correct diff for each bug", () => {
      const solution = readFileSync(resolve(TASK_DIR, "SOLUTION.md"), "utf-8");
      // Bug 1 diff: >= to >
      expect(solution).toContain("- if (payload.exp >= nowSeconds)");
      expect(solution).toContain("+ if (payload.exp > nowSeconds)");
      // Bug 2 diff: > to >=
      expect(solution).toContain("- if (Date.now() > entry.expiresAt)");
      expect(solution).toContain("+ if (Date.now() >= entry.expiresAt)");
      // Bug 3 diff: 401 to 403
      expect(solution).toContain("-     status: 401,");
      expect(solution).toContain("+     status: 403,");
    });
  });

  describe("test suite", () => {
    it("has 10 test cases", () => {
      const testSrc = readFileSync(resolve(TASK_DIR, "tests/auth.test.ts"), "utf-8");
      // Count it() calls (the actual test cases)
      const testCount = (testSrc.match(/\bit\s*\(/g) || []).length;
      expect(testCount).toBe(10);
    });

    it("tests cover all three bugs", () => {
      const testSrc = readFileSync(resolve(TASK_DIR, "tests/auth.test.ts"), "utf-8");
      // Bug 1: test for expiry boundary
      expect(testSrc).toContain("exact expiry boundary");
      // Bug 2: test for TTL boundary
      expect(testSrc).toContain("exact TTL boundary");
      // Bug 3: test for 403 status on expired tokens
      expect(testSrc).toContain("403");
    });

    it("tests expect correct (fixed) behavior", () => {
      const testSrc = readFileSync(resolve(TASK_DIR, "tests/auth.test.ts"), "utf-8");
      // Bug 1: expects token at exact expiry to be invalid
      expect(testSrc).toContain("result.valid");
      expect(testSrc).toMatch(/expect\(result\.valid\)\.toBe\(false\)/);
      // Bug 2: expects undefined at exact TTL
      expect(testSrc).toMatch(/expect\(value\)\.toBeUndefined\(\)/);
      // Bug 3: expects 403 for expired tokens
      expect(testSrc).toMatch(/expect\(result\.status\)\.toBe\(403\)/);
    });
  });
});
