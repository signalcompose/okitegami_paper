import { describe, it, expect } from "vitest";
import { TaskEvaluator } from "../../experiments/harness/task-evaluator.js";

describe("TaskEvaluator", () => {
  const evaluator = new TaskEvaluator();

  describe("evaluateTestResults", () => {
    it("parses vitest JSON output correctly — all tests pass", () => {
      const output = JSON.stringify({
        numTotalTests: 10,
        numPassedTests: 10,
        numFailedTests: 0,
        testResults: [{ name: "test.ts", status: "passed", assertionResults: [] }],
      });
      const result = evaluator.evaluateTestResults("task-a", output);
      expect(result.completion_rate).toBe(1.0);
      expect(result.total_checks).toBe(10);
      expect(result.passed_checks).toBe(10);
    });

    it("parses vitest JSON output — partial pass", () => {
      const output = JSON.stringify({
        numTotalTests: 10,
        numPassedTests: 7,
        numFailedTests: 3,
        testResults: [],
      });
      const result = evaluator.evaluateTestResults("task-a", output);
      expect(result.completion_rate).toBe(0.7);
      expect(result.passed_checks).toBe(7);
    });

    it("handles vitest output with non-JSON prefix", () => {
      const output =
        "Some vitest preamble text\n" +
        JSON.stringify({
          numTotalTests: 5,
          numPassedTests: 5,
          numFailedTests: 0,
          testResults: [],
        });
      const result = evaluator.evaluateTestResults("task-b", output);
      expect(result.completion_rate).toBe(1.0);
    });

    it("throws on completely invalid output", () => {
      expect(() => evaluator.evaluateTestResults("task-a", "not json at all")).toThrow();
    });

    it("handles zero tests", () => {
      const output = JSON.stringify({
        numTotalTests: 0,
        numPassedTests: 0,
        numFailedTests: 0,
        testResults: [],
      });
      const result = evaluator.evaluateTestResults("task-a", output);
      expect(result.completion_rate).toBe(0);
      expect(result.total_checks).toBe(0);
    });
  });

  describe("evaluateLintResults", () => {
    it("parses ESLint JSON with no violations → 1.0 lint rate", () => {
      const vitestOut = JSON.stringify({
        numTotalTests: 5,
        numPassedTests: 5,
        numFailedTests: 0,
        testResults: [],
      });
      const eslintOut = JSON.stringify([
        { filePath: "a.ts", messages: [], errorCount: 0, warningCount: 0 },
        { filePath: "b.ts", messages: [], errorCount: 0, warningCount: 0 },
      ]);
      const result = evaluator.evaluateLintResults(vitestOut, eslintOut);
      expect(result.completion_rate).toBe(1.0);
    });

    it("parses ESLint JSON with violations", () => {
      const vitestOut = JSON.stringify({
        numTotalTests: 5,
        numPassedTests: 5,
        numFailedTests: 0,
        testResults: [],
      });
      const eslintOut = JSON.stringify([
        {
          filePath: "a.ts",
          messages: [
            {
              ruleId: "no-direct-instantiation",
              message: "DI violation",
              severity: 2,
              line: 1,
              column: 1,
            },
          ],
          errorCount: 1,
          warningCount: 0,
        },
        { filePath: "b.ts", messages: [], errorCount: 0, warningCount: 0 },
      ]);
      const result = evaluator.evaluateLintResults(vitestOut, eslintOut);
      // lint_pass_rate = 1/2 = 0.5, test_pass_rate = 1.0
      // combined = (1.0 * 0.5) + (0.5 * 0.5) = 0.75
      expect(result.completion_rate).toBe(0.75);
    });

    it("handles all files with violations", () => {
      const vitestOut = JSON.stringify({
        numTotalTests: 5,
        numPassedTests: 0,
        numFailedTests: 5,
        testResults: [],
      });
      const eslintOut = JSON.stringify([
        {
          filePath: "a.ts",
          messages: [
            {
              ruleId: "no-direct-instantiation",
              message: "DI",
              severity: 2,
              line: 1,
              column: 1,
            },
          ],
          errorCount: 1,
          warningCount: 0,
        },
      ]);
      const result = evaluator.evaluateLintResults(vitestOut, eslintOut);
      // lint_pass_rate = 0, test_pass_rate = 0
      expect(result.completion_rate).toBe(0);
    });
  });

  describe("evaluate (dispatch)", () => {
    it("dispatches task-a to evaluateTestResults", () => {
      const output = JSON.stringify({
        numTotalTests: 10,
        numPassedTests: 10,
        numFailedTests: 0,
        testResults: [],
      });
      const result = evaluator.evaluate("task-a", { vitest: output });
      expect(result.task).toBe("task-a");
      expect(result.completion_rate).toBe(1.0);
    });

    it("dispatches task-c to evaluateLintResults", () => {
      const vitestOut = JSON.stringify({
        numTotalTests: 5,
        numPassedTests: 5,
        numFailedTests: 0,
        testResults: [],
      });
      const eslintOut = JSON.stringify([
        { filePath: "a.ts", messages: [], errorCount: 0, warningCount: 0 },
      ]);
      const result = evaluator.evaluate("task-c", {
        vitest: vitestOut,
        eslint: eslintOut,
      });
      expect(result.task).toBe("task-c");
    });

    it("throws when ESLint reports zero files", () => {
      const vitestOut = JSON.stringify({
        numTotalTests: 5,
        numPassedTests: 5,
        numFailedTests: 0,
        testResults: [],
      });
      const eslintOut = JSON.stringify([]);
      expect(() => evaluator.evaluate("task-c", { vitest: vitestOut, eslint: eslintOut })).toThrow(
        "ESLint reported zero files"
      );
    });

    it("throws when task-a missing vitest output", () => {
      expect(() => evaluator.evaluate("task-a", {})).toThrow();
    });

    it("throws when task-c missing eslint output", () => {
      const vitestOut = JSON.stringify({
        numTotalTests: 5,
        numPassedTests: 5,
        numFailedTests: 0,
        testResults: [],
      });
      expect(() => evaluator.evaluate("task-c", { vitest: vitestOut })).toThrow();
    });
  });
});
