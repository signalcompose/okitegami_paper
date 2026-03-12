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
    interrupt_context?: InterruptContext;
}
export interface AcmConfig {
    mode: AcmMode;
    top_k: number;
    capture_turns: number;
    promotion_threshold: number;
    db_path: string;
}
export declare const DEFAULT_CONFIG: AcmConfig;
//# sourceMappingURL=types.d.ts.map