import { describe, it, expect } from "vitest";
import { ReportGenerator } from "../../experiments/harness/report-generator.js";
import { RunResult, MetricSet, RunSpec } from "../../experiments/harness/types.js";

function makeRunResult(overrides: Partial<RunResult> & { spec: RunSpec }): RunResult {
  const defaultMetrics: MetricSet = {
    run_id: overrides.spec.run_id,
    condition: overrides.spec.condition,
    task: overrides.spec.task,
    context_size: overrides.spec.context_size,
    session_number: overrides.spec.session_number,
    task_completion_rate: 0.8,
    interrupt_count: 2,
    corrective_instruction_count: 1,
    context_tokens_used: 50000,
    token_usage: 10000,
    attempt_count: 2,
    timestamp: "2026-03-10T00:00:00.000Z",
  };
  return {
    spec: overrides.spec,
    metrics: overrides.metrics ?? defaultMetrics,
    duration_ms: overrides.duration_ms ?? 60000,
    error: overrides.error,
  };
}

describe("ReportGenerator", () => {
  const generator = new ReportGenerator();

  describe("generateReport", () => {
    it("generates a report with aggregated results", () => {
      const runs: RunResult[] = [
        makeRunResult({
          spec: {
            condition: "control",
            task: "task-a",
            context_size: "full",
            session_number: 1,
            run_id: "r1",
          },
          metrics: {
            run_id: "r1",
            condition: "control",
            task: "task-a",
            context_size: "full",
            session_number: 1,
            task_completion_rate: 0.6,
            interrupt_count: 3,
            corrective_instruction_count: 2,
            context_tokens_used: 60000,
            token_usage: 15000,
            attempt_count: 4,
            timestamp: "2026-03-10T00:00:00.000Z",
          },
        }),
        makeRunResult({
          spec: {
            condition: "control",
            task: "task-a",
            context_size: "full",
            session_number: 2,
            run_id: "r2",
          },
          metrics: {
            run_id: "r2",
            condition: "control",
            task: "task-a",
            context_size: "full",
            session_number: 2,
            task_completion_rate: 0.8,
            interrupt_count: 1,
            corrective_instruction_count: 0,
            context_tokens_used: 40000,
            token_usage: 9000,
            attempt_count: 2,
            timestamp: "2026-03-10T00:01:00.000Z",
          },
        }),
        makeRunResult({
          spec: {
            condition: "acm-sf",
            task: "task-a",
            context_size: "full",
            session_number: 1,
            run_id: "r3",
          },
          metrics: {
            run_id: "r3",
            condition: "acm-sf",
            task: "task-a",
            context_size: "full",
            session_number: 1,
            task_completion_rate: 0.9,
            interrupt_count: 0,
            corrective_instruction_count: 0,
            context_tokens_used: 45000,
            token_usage: 8000,
            attempt_count: 1,
            timestamp: "2026-03-10T00:02:00.000Z",
          },
        }),
      ];

      const report = generator.generateReport("exp-001", runs);

      expect(report.experiment_id).toBe("exp-001");
      expect(report.runs).toHaveLength(3);
      expect(report.aggregated).toHaveLength(2); // control and acm-sf
      expect(report.started_at).toBeDefined();
      expect(report.completed_at).toBeDefined();

      // Check control aggregation
      const controlAgg = report.aggregated.find((a) => a.condition === "control");
      expect(controlAgg).toBeDefined();
      expect(controlAgg!.mean_completion_rate).toBeCloseTo(0.7, 5);
      expect(controlAgg!.run_count).toBe(2);
      expect(controlAgg!.mean_interrupt_count).toBeCloseTo(2, 5);
      expect(controlAgg!.mean_token_usage).toBeCloseTo(12000, 5);
      expect(controlAgg!.mean_attempt_count).toBeCloseTo(3, 5);

      // Check acm-sf aggregation
      const acmAgg = report.aggregated.find((a) => a.condition === "acm-sf");
      expect(acmAgg).toBeDefined();
      expect(acmAgg!.mean_completion_rate).toBeCloseTo(0.9, 5);
      expect(acmAgg!.run_count).toBe(1);
      expect(acmAgg!.mean_token_usage).toBeCloseTo(8000, 5);
      expect(acmAgg!.mean_attempt_count).toBeCloseTo(1, 5);
    });

    it("handles empty runs", () => {
      const report = generator.generateReport("exp-empty", []);
      expect(report.runs).toHaveLength(0);
      expect(report.aggregated).toHaveLength(0);
    });
  });

  describe("exportCSV", () => {
    it("generates CSV with headers and data rows", () => {
      const runs: RunResult[] = [
        makeRunResult({
          spec: {
            condition: "control",
            task: "task-a",
            context_size: "full",
            session_number: 1,
            run_id: "r1",
          },
        }),
      ];

      const csv = generator.exportCSV(runs);
      const lines = csv.trim().split("\n");

      // Header line
      expect(lines[0]).toContain("run_id");
      expect(lines[0]).toContain("condition");
      expect(lines[0]).toContain("task");
      expect(lines[0]).toContain("task_completion_rate");
      expect(lines[0]).toContain("token_usage");
      expect(lines[0]).toContain("attempt_count");

      // Data line
      expect(lines[1]).toContain("r1");
      expect(lines[1]).toContain("control");
      expect(lines[1]).toContain("task-a");
    });

    it("handles empty runs", () => {
      const csv = generator.exportCSV([]);
      const lines = csv.trim().split("\n");
      expect(lines).toHaveLength(1); // header only
    });

    it("generates correct number of data rows", () => {
      const runs: RunResult[] = [
        makeRunResult({
          spec: {
            condition: "control",
            task: "task-a",
            context_size: "full",
            session_number: 1,
            run_id: "r1",
          },
        }),
        makeRunResult({
          spec: {
            condition: "acm-sf",
            task: "task-b",
            context_size: "half",
            session_number: 2,
            run_id: "r2",
          },
        }),
      ];

      const csv = generator.exportCSV(runs);
      const lines = csv.trim().split("\n");
      expect(lines).toHaveLength(3); // 1 header + 2 data
    });
  });

  describe("exportJSON", () => {
    it("generates valid JSON report string", () => {
      const runs: RunResult[] = [
        makeRunResult({
          spec: {
            condition: "control",
            task: "task-a",
            context_size: "full",
            session_number: 1,
            run_id: "r1",
          },
        }),
      ];

      const report = generator.generateReport("exp-json", runs);
      const jsonStr = generator.exportJSON(report);
      const parsed = JSON.parse(jsonStr);

      expect(parsed.experiment_id).toBe("exp-json");
      expect(parsed.runs).toHaveLength(1);
    });
  });
});
