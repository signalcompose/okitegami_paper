import { TaskName, VitestJsonResult, EslintJsonResult } from "./types.js";

export interface EvaluationResult {
  task: TaskName;
  completion_rate: number; // 0-1
  total_checks: number;
  passed_checks: number;
  details: string[];
}

export class TaskEvaluator {
  /**
   * Evaluate Task A or B: parse vitest JSON reporter output.
   * Returns completion_rate = numPassedTests / numTotalTests.
   */
  evaluateTestResults(task: TaskName, vitestOutput: string): EvaluationResult {
    const parsed = this.parseVitestJson(vitestOutput);
    const total = parsed.numTotalTests;
    const passed = parsed.numPassedTests;
    const rate = total === 0 ? 0 : passed / total;

    return {
      task,
      completion_rate: rate,
      total_checks: total,
      passed_checks: passed,
      details: [`Test pass rate: ${passed}/${total} (${rate.toFixed(2)})`],
    };
  }

  /**
   * Evaluate Task C: combine vitest test results and ESLint lint results.
   * completion_rate = (test_pass_rate * 0.5) + (lint_pass_rate * 0.5)
   */
  evaluateLintResults(vitestOutput: string, eslintOutput: string): EvaluationResult {
    const vitest = this.parseVitestJson(vitestOutput);
    const eslint = this.parseEslintJson(eslintOutput);

    const testTotal = vitest.numTotalTests;
    const testPassed = vitest.numPassedTests;
    const testRate = testTotal === 0 ? 0 : testPassed / testTotal;

    const totalFiles = eslint.length;
    const cleanFiles = eslint.filter((f) => f.errorCount === 0).length;
    const lintRate = totalFiles === 0 ? 1.0 : cleanFiles / totalFiles;

    const combinedRate = testRate * 0.5 + lintRate * 0.5;
    const totalChecks = testTotal + totalFiles;
    const passedChecks = testPassed + cleanFiles;

    return {
      task: "task-c",
      completion_rate: combinedRate,
      total_checks: totalChecks,
      passed_checks: passedChecks,
      details: [
        `Test pass rate: ${testPassed}/${testTotal} (${testRate.toFixed(2)})`,
        `Lint: ${cleanFiles}/${totalFiles} files clean`,
        `Combined: (${testRate.toFixed(2)} * 0.5) + (${lintRate.toFixed(2)} * 0.5) = ${combinedRate.toFixed(2)}`,
      ],
    };
  }

  /**
   * Main evaluate method - dispatches to the right evaluator based on task.
   */
  evaluate(task: TaskName, outputs: { vitest?: string; eslint?: string }): EvaluationResult {
    if (task === "task-c") {
      if (!outputs.vitest || !outputs.eslint) {
        throw new Error("Task C evaluation requires both vitest and eslint outputs");
      }
      return this.evaluateLintResults(outputs.vitest, outputs.eslint);
    }

    if (!outputs.vitest) {
      throw new Error(`Task ${task} evaluation requires vitest output`);
    }
    return this.evaluateTestResults(task, outputs.vitest);
  }

  /**
   * Parse vitest JSON output, handling non-JSON preamble text.
   */
  private parseVitestJson(raw: string): VitestJsonResult {
    const jsonStart = raw.indexOf("{");
    if (jsonStart === -1) {
      throw new Error("No JSON object found in vitest output");
    }
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonEnd === -1 || jsonEnd < jsonStart) {
      throw new Error("No closing brace found in vitest output");
    }
    const jsonStr = raw.slice(jsonStart, jsonEnd + 1);
    try {
      return JSON.parse(jsonStr) as VitestJsonResult;
    } catch {
      throw new Error("Failed to parse vitest JSON output");
    }
  }

  /**
   * Parse ESLint JSON output (always a JSON array).
   */
  private parseEslintJson(raw: string): EslintJsonResult[] {
    try {
      return JSON.parse(raw) as EslintJsonResult[];
    } catch {
      throw new Error("Failed to parse ESLint JSON output");
    }
  }
}
