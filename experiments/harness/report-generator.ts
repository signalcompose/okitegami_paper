/**
 * Report generator for ACM experiment results.
 * Aggregates run results by condition and exports CSV/JSON.
 */

import { mean, standardDeviation } from "./stats.js";
import type {
  RunResult,
  AggregatedConditionResult,
  ExperimentReport,
  ConditionName,
} from "./types.js";

const CSV_COLUMNS = [
  "run_id",
  "condition",
  "task",
  "context_size",
  "session_number",
  "task_completion_rate",
  "interrupt_count",
  "corrective_instruction_count",
  "context_tokens_used",
  "duration_ms",
  "error",
  "timestamp",
] as const;

export class ReportGenerator {
  /**
   * Generate an experiment report with per-condition aggregated statistics.
   */
  generateReport(experimentId: string, runs: RunResult[]): ExperimentReport {
    const timestamps = runs
      .map((r) => r.metrics.timestamp)
      .filter(Boolean)
      .sort();

    const aggregated = this.aggregateByCondition(runs);

    return {
      experiment_id: experimentId,
      started_at: timestamps[0] ?? new Date().toISOString(),
      completed_at: timestamps[timestamps.length - 1] ?? new Date().toISOString(),
      runs,
      aggregated,
    };
  }

  /**
   * Export run results as CSV string.
   */
  exportCSV(runs: RunResult[]): string {
    const header = CSV_COLUMNS.join(",");
    const rows = runs.map((r) => this.runToCSVRow(r));
    return [header, ...rows].join("\n") + "\n";
  }

  /**
   * Export an experiment report as pretty-printed JSON string.
   */
  exportJSON(report: ExperimentReport): string {
    return JSON.stringify(report, null, 2);
  }

  private aggregateByCondition(runs: RunResult[]): AggregatedConditionResult[] {
    const grouped = new Map<ConditionName, RunResult[]>();

    for (const run of runs) {
      const condition = run.spec.condition;
      const group = grouped.get(condition) ?? [];
      group.push(run);
      grouped.set(condition, group);
    }

    const results: AggregatedConditionResult[] = [];

    for (const [condition, group] of grouped) {
      const completionRates = group.map((r) => r.metrics.task_completion_rate);
      const interruptCounts = group.map((r) => r.metrics.interrupt_count);
      const correctiveCounts = group.map((r) => r.metrics.corrective_instruction_count);
      const contextTokens = group.map((r) => r.metrics.context_tokens_used);

      results.push({
        condition,
        mean_completion_rate: mean(completionRates),
        std_completion_rate: standardDeviation(completionRates),
        mean_interrupt_count: mean(interruptCounts),
        std_interrupt_count: standardDeviation(interruptCounts),
        mean_corrective_count: mean(correctiveCounts),
        std_corrective_count: standardDeviation(correctiveCounts),
        mean_context_tokens: mean(contextTokens),
        std_context_tokens: standardDeviation(contextTokens),
        run_count: group.length,
      });
    }

    return results;
  }

  private escapeCSV(value: string | number): string {
    const str = String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  private runToCSVRow(run: RunResult): string {
    const m = run.metrics;
    const values: Array<string | number> = [
      m.run_id,
      m.condition,
      m.task,
      m.context_size,
      m.session_number,
      m.task_completion_rate,
      m.interrupt_count,
      m.corrective_instruction_count,
      m.context_tokens_used,
      run.duration_ms,
      run.error ?? "",
      m.timestamp,
    ];
    return values.map((v) => this.escapeCSV(v)).join(",");
  }
}
