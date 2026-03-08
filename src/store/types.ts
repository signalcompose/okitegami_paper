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

export const ACM_MODES = [
  "disabled",
  "success_only",
  "failure_only",
  "full",
] as const;
export type AcmMode = (typeof ACM_MODES)[number];

export interface InterruptContext {
  turns_captured: number; // N=3–5 post-interrupt turns
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
  interrupt_context?: InterruptContext; // Failure-specific
}

export interface AcmConfig {
  mode: AcmMode;
  top_k: number; // Number of entries to retrieve
  capture_turns: number; // Post-interrupt turns to capture
  promotion_threshold: number; // Minimum signal strength to persist
  db_path: string; // SQLite DB path (supports ~)
}

export const DEFAULT_CONFIG: AcmConfig = {
  mode: "full",
  top_k: 5,
  capture_turns: 5,
  promotion_threshold: 0.3,
  db_path: "~/.acm/experiences.db",
};
