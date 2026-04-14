/**
 * ACM type definitions — SPECIFICATION.md Section 2.1, 5.1
 */
export declare const SIGNAL_TYPES: readonly ["interrupt_with_dialogue", "rewind", "corrective_instruction", "uninterrupted_completion"];
export type SignalType = (typeof SIGNAL_TYPES)[number];
export declare const ACM_MODES: readonly ["disabled", "success_only", "failure_only", "full"];
export type AcmMode = (typeof ACM_MODES)[number];
export interface InterruptContext {
    turns_captured: number;
    dialogue_summary: string;
}
export interface ExperienceEntry {
    id: string;
    type: "success" | "failure";
    trigger: string;
    action: string;
    outcome: string;
    retrieval_keys: string[];
    signal_strength: number;
    signal_type: SignalType;
    session_id: string;
    timestamp: string;
    project?: string;
    interrupt_context?: InterruptContext;
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
    transfer_count: number;
}
export interface MeasurementReport {
    recurrence_rate: RecurrenceRateRow[];
    temporal_trend: TemporalTrendRow[];
    injection_outcome_correlation: InjectionOutcomeRow[];
    cross_project_transfer: CrossProjectTransferRow[];
}
export interface AcmConfig {
    mode: AcmMode;
    top_k: number;
    capture_turns: number;
    promotion_threshold: number;
    db_path: string;
    ollama_url?: string;
    ollama_model?: string;
}
export declare const DEFAULT_CONFIG: AcmConfig;
//# sourceMappingURL=types.d.ts.map