export type ConditionName = "control" | "baseline-compact" | "acm-s" | "acm-f" | "acm-sf";
export type TaskName = "task-a" | "task-b" | "task-c" | "task-d";
export type ContextSize = "full" | "half" | "smart-zone";

export interface RunSpec {
  condition: ConditionName;
  task: TaskName;
  context_size: ContextSize;
  session_number: number; // 1-5
  run_id: string;
}

export interface MetricSet {
  run_id: string;
  condition: ConditionName;
  task: TaskName;
  context_size: ContextSize;
  session_number: number;
  task_completion_rate: number; // 0-1
  interrupt_count: number;
  corrective_instruction_count: number;
  context_tokens_used: number;
  token_usage: number;
  attempt_count: number;
  timestamp: string;
}

export interface RunResult {
  spec: RunSpec;
  metrics: MetricSet;
  duration_ms: number;
  error?: string;
}

export interface AggregatedConditionResult {
  condition: ConditionName;
  mean_completion_rate: number;
  std_completion_rate: number;
  mean_interrupt_count: number;
  std_interrupt_count: number;
  mean_corrective_count: number;
  std_corrective_count: number;
  mean_context_tokens: number;
  std_context_tokens: number;
  mean_token_usage: number;
  std_token_usage: number;
  mean_attempt_count: number;
  std_attempt_count: number;
  run_count: number;
}

export interface ExperimentReport {
  experiment_id: string;
  started_at: string;
  completed_at: string;
  runs: RunResult[];
  aggregated: AggregatedConditionResult[];
}

// Vitest JSON reporter output types (subset we parse)
export interface VitestJsonResult {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  testResults: Array<{
    name: string;
    status: "passed" | "failed";
    assertionResults: Array<{
      fullName: string;
      status: "passed" | "failed";
      failureMessages?: string[];
    }>;
  }>;
}

// ESLint JSON output types (subset we parse)
export interface EslintJsonResult {
  filePath: string;
  messages: Array<{
    ruleId: string;
    message: string;
    severity: number;
    line: number;
    column: number;
  }>;
  errorCount: number;
  warningCount: number;
}
