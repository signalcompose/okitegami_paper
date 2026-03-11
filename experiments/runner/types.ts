import { ConditionName, TaskName, ContextSize } from "../harness/types.js";

export interface ConditionSpec {
  name: ConditionName;
  config_path: string; // path to JSON config file
  auto_compact: boolean; // whether to enable auto-compact
}

export interface MilestoneFilter {
  conditions: ConditionName[];
  tasks: TaskName[];
  context_sizes: ContextSize[];
  sessions: number;
}

// Predefined milestone filters
export const MILESTONE_6A: MilestoneFilter = {
  conditions: ["control", "acm-sf"],
  tasks: ["task-a"],
  context_sizes: ["full"],
  sessions: 5,
};

export const MILESTONE_6A_C: MilestoneFilter = {
  conditions: ["control", "acm-sf"],
  tasks: ["task-c"],
  context_sizes: ["full"],
  sessions: 5,
};

export const MILESTONE_6D: MilestoneFilter = {
  conditions: ["control", "acm-sf"],
  tasks: ["task-d"],
  context_sizes: ["full"],
  sessions: 5,
};

export const FULL_EXPERIMENT: MilestoneFilter = {
  conditions: ["control", "baseline-compact", "acm-s", "acm-f", "acm-sf"],
  tasks: ["task-a", "task-b", "task-c"],
  context_sizes: ["full", "half", "smart-zone"],
  sessions: 5,
};

// Shared mappings (single source for runner modules)
export const TASK_DIRS: Record<string, string> = {
  "task-a": "task-a-bugfix",
  "task-b": "task-b-feature",
  "task-c": "task-c-refactor",
  "task-d": "task-d-orbitscore", // supersedes task-d-dungeon (retained for reference)
};

const NON_ACM_CONDITIONS: ReadonlySet<string> = new Set(["control", "baseline-compact"]);

export function isAcmCondition(condition: ConditionName | string): boolean {
  return !NON_ACM_CONDITIONS.has(condition);
}

export const CONDITION_CONFIGS: Record<string, string> = {
  control: "control.json",
  "baseline-compact": "baseline-compact.json",
  "acm-s": "acm-s.json",
  "acm-f": "acm-f.json",
  "acm-sf": "acm-sf.json",
};
