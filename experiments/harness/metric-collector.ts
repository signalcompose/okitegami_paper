import { MetricSet, ConditionName, TaskName, ContextSize } from "./types.js";

export interface SignalData {
  interrupt_count: number;
  corrective_instruction_count: number;
}

export interface SessionLogData {
  context_tokens_used: number;
}

export interface CollectInput {
  run_id: string;
  condition: ConditionName;
  task: TaskName;
  context_size: ContextSize;
  session_number: number;
  completion_rate: number;
  signals?: SignalData;
  sessionLog?: SessionLogData;
}

export class MetricCollector {
  collect(input: CollectInput): MetricSet {
    return {
      run_id: input.run_id,
      condition: input.condition,
      task: input.task,
      context_size: input.context_size,
      session_number: input.session_number,
      task_completion_rate: input.completion_rate,
      interrupt_count: input.signals?.interrupt_count ?? 0,
      corrective_instruction_count: input.signals?.corrective_instruction_count ?? 0,
      context_tokens_used: input.sessionLog?.context_tokens_used ?? 0,
      timestamp: new Date().toISOString(),
    };
  }

  collectBatch(inputs: CollectInput[]): MetricSet[] {
    return inputs.map((input) => this.collect(input));
  }
}
