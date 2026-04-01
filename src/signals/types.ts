/**
 * Session signal types — SPECIFICATION.md Section 3
 *
 * These types represent individual hook events captured during a session.
 * Distinct from ExperienceEntry types (store/types.ts) which are generated
 * from aggregated signals at session end (Phase 3).
 */

export const EVENT_TYPES = [
  "interrupt",
  "post_interrupt_turn",
  "corrective_instruction",
  "tool_success",
  "tool_failure",
  "stop",
  "rewind",
  "injection",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// --- Hook input types (received via stdin JSON from Claude Code hooks) ---

export interface HookInputBase {
  session_id: string;
  transcript_path: string;
  cwd?: string; // Not all hook types provide cwd
  hook_event_name: string;
}

export interface PostToolUseFailureInput extends HookInputBase {
  hook_event_name: "PostToolUseFailure";
  tool_name: string;
  error: string;
  is_interrupt: boolean;
}

export interface UserPromptSubmitInput extends HookInputBase {
  hook_event_name: "UserPromptSubmit";
  prompt: string;
}

export interface PostToolUseInput extends HookInputBase {
  hook_event_name: "PostToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface StopInput extends HookInputBase {
  hook_event_name: "Stop";
  last_assistant_message?: string;
  stop_hook_active?: boolean;
}

export type HookInput =
  | PostToolUseFailureInput
  | UserPromptSubmitInput
  | PostToolUseInput
  | StopInput;

// --- Session signal (persisted to SQLite) ---

export interface SessionSignal {
  id: number;
  session_id: string;
  event_type: EventType;
  data: Record<string, unknown> | null;
  timestamp: string;
}
