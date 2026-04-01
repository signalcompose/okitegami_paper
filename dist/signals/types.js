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
];
//# sourceMappingURL=types.js.map