import { describe, it, expect } from "vitest";
import { MetricCollector } from "../../experiments/harness/metric-collector.js";

describe("MetricCollector", () => {
  const collector = new MetricCollector();

  describe("collect", () => {
    it("combines task evaluation, signals, and session data into MetricSet", () => {
      const result = collector.collect({
        run_id: "run-001",
        condition: "acm-sf",
        task: "task-a",
        context_size: "full",
        session_number: 1,
        completion_rate: 0.7,
        signals: {
          interrupt_count: 3,
          corrective_instruction_count: 1,
        },
        sessionLog: {
          context_tokens_used: 50000,
        },
        token_usage: 12000,
        attempt_count: 3,
      });

      expect(result.run_id).toBe("run-001");
      expect(result.condition).toBe("acm-sf");
      expect(result.task).toBe("task-a");
      expect(result.context_size).toBe("full");
      expect(result.session_number).toBe(1);
      expect(result.task_completion_rate).toBe(0.7);
      expect(result.interrupt_count).toBe(3);
      expect(result.corrective_instruction_count).toBe(1);
      expect(result.context_tokens_used).toBe(50000);
      expect(result.token_usage).toBe(12000);
      expect(result.attempt_count).toBe(3);
      expect(result.timestamp).toBeDefined();
    });

    it("handles control condition with zero signals", () => {
      const result = collector.collect({
        run_id: "run-002",
        condition: "control",
        task: "task-b",
        context_size: "half",
        session_number: 2,
        completion_rate: 1.0,
        signals: {
          interrupt_count: 0,
          corrective_instruction_count: 0,
        },
        sessionLog: {
          context_tokens_used: 30000,
        },
      });

      expect(result.interrupt_count).toBe(0);
      expect(result.corrective_instruction_count).toBe(0);
      expect(result.task_completion_rate).toBe(1.0);
    });

    it("uses default values when signals and process metrics are not provided", () => {
      const result = collector.collect({
        run_id: "run-003",
        condition: "control",
        task: "task-a",
        context_size: "full",
        session_number: 1,
        completion_rate: 0.5,
      });

      expect(result.interrupt_count).toBe(0);
      expect(result.corrective_instruction_count).toBe(0);
      expect(result.context_tokens_used).toBe(0);
      expect(result.token_usage).toBe(0);
      expect(result.attempt_count).toBe(0);
    });

    it("generates ISO timestamp", () => {
      const result = collector.collect({
        run_id: "run-004",
        condition: "acm-s",
        task: "task-c",
        context_size: "smart-zone",
        session_number: 3,
        completion_rate: 0.8,
      });

      // Validate ISO 8601 format
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });

  describe("collectBatch", () => {
    it("collects multiple runs", () => {
      const inputs = [
        {
          run_id: "r1",
          condition: "control" as const,
          task: "task-a" as const,
          context_size: "full" as const,
          session_number: 1,
          completion_rate: 0.5,
        },
        {
          run_id: "r2",
          condition: "acm-sf" as const,
          task: "task-a" as const,
          context_size: "full" as const,
          session_number: 1,
          completion_rate: 0.8,
        },
      ];
      const results = collector.collectBatch(inputs);
      expect(results).toHaveLength(2);
      expect(results[0].run_id).toBe("r1");
      expect(results[1].run_id).toBe("r2");
    });
  });
});
