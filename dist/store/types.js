/**
 * ACM type definitions — SPECIFICATION.md Section 2.1, 5.1
 */
export const SIGNAL_TYPES = [
    "interrupt_with_dialogue", // Level 1
    "rewind", // Level 2
    "corrective_instruction", // Level 3
    "uninterrupted_completion", // Level 4
];
export const ACM_MODES = ["disabled", "success_only", "failure_only", "full"];
export const VERBOSITY_LEVELS = ["quiet", "normal", "verbose"];
export const DEFAULT_CONFIG = {
    mode: "full",
    top_k: 5,
    capture_turns: 5,
    promotion_threshold: 0.3,
    db_path: "~/.acm/experiences.db",
    verbosity: "normal",
};
//# sourceMappingURL=types.js.map