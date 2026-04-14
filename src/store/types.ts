/**
 * ACM type definitions — SPECIFICATION.md Section 2.1, 5.1
 */

export const SIGNAL_TYPES = [
  "interrupt_with_dialogue", // Level 1
  "rewind", // Level 2
  "corrective_instruction", // Level 3
  "uninterrupted_completion", // Level 4
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

export const ACM_MODES = ["disabled", "success_only", "failure_only", "full"] as const;
export type AcmMode = (typeof ACM_MODES)[number];

export const VERBOSITY_LEVELS = ["quiet", "normal", "verbose"] as const;
export type Verbosity = (typeof VERBOSITY_LEVELS)[number];

export interface InterruptContext {
  turns_captured: number; // Post-interrupt turns captured (configurable via capture_turns)
  dialogue_summary: string; // Why the user interrupted
}

export interface ExperienceEntry {
  id: string; // UUID
  type: "success" | "failure";
  trigger: string; // Task description / context
  action: string; // What the agent did
  outcome: string; // Result description
  retrieval_keys: string[]; // Keywords for semantic retrieval
  signal_strength: number; // 0.0–1.0
  signal_type: SignalType; // Level 1–4
  session_id: string;
  timestamp: string; // ISO 8601
  project?: string; // Project name (derived from cwd basename)
  interrupt_context?: InterruptContext; // Failure-specific
}

export interface ProjectReportRow {
  project: string;
  total_entries: number;
  success_count: number;
  failure_count: number;
  avg_signal_strength: number;
  first_entry: string;
  last_entry: string;
}

export interface SessionSignalSummary {
  interrupt_count: number;
  corrective_count: number;
  tool_success_count: number;
  had_test_pass: boolean;
  was_stopped_normally: boolean;
}

export interface InjectionEpisode {
  session_id: string;
  project: string;
  timestamp: string;
  injected_experiences: ExperienceEntry[];
  session_signals: SessionSignalSummary;
  outcome_experiences: ExperienceEntry[];
}

export interface RecurrenceRateRow {
  key: string;
  occurrence_count: number;
  first_seen: string;
  last_seen: string;
}

export interface TemporalTrendRow {
  session_id: string;
  corrective_count: number;
  tool_success_count: number;
  corrective_rate: number;
  timestamp: string;
}

export interface InjectionOutcomeRow {
  session_id: string;
  injected_count: number;
  corrective_count: number;
  timestamp: string;
}

export interface CrossProjectTransferRow {
  source_project: string;
  target_project: string;
  transfer_count: number; // Count of individual experience entries transferred (not injection events)
}

export interface MeasurementReport {
  recurrence_rate: RecurrenceRateRow[];
  temporal_trend: TemporalTrendRow[];
  injection_outcome_correlation: InjectionOutcomeRow[];
  cross_project_transfer: CrossProjectTransferRow[];
}

export interface AcmConfig {
  mode: AcmMode;
  top_k: number; // Number of entries to retrieve
  capture_turns: number; // Post-interrupt turns to capture
  promotion_threshold: number; // Minimum signal strength to persist
  db_path: string; // SQLite DB path (supports ~)
  verbosity: Verbosity; // systemMessage detail level (default: normal)
  ollama_url?: string; // Ollama API URL (default: http://localhost:11434)
  ollama_model?: string; // Ollama model for corrective classification (default: gemma2:2b)
}

export const DEFAULT_CONFIG: AcmConfig = {
  mode: "full",
  top_k: 5,
  capture_turns: 5,
  promotion_threshold: 0.3,
  db_path: "~/.acm/experiences.db",
  verbosity: "normal",
};
