/**
 * SignalCollector — stateless hook event processor
 * SPECIFICATION.md Sections 3.2–3.5
 *
 * Each method opens/queries SQLite via SessionSignalStore,
 * writes signals, and returns. No in-memory session state.
 */
import type { SessionSignalStore } from "./session-store.js";
import type { EventType } from "./types.js";
export interface SignalCollectorOptions {
    capture_turns: number;
}
export interface SessionSummary {
    session_id: string;
    total_signals: number;
    counts: Record<EventType, number>;
    was_interrupted: boolean;
    corrective_instruction_count: number;
    has_test_pass: boolean;
}
export declare class SignalCollector {
    private store;
    private options;
    constructor(store: SessionSignalStore, options: SignalCollectorOptions);
    handleInterrupt(sessionId: string, toolName: string, error: string): void;
    handleUserPrompt(sessionId: string, prompt: string): void;
    handleToolSuccess(sessionId: string, toolName: string, toolInput: Record<string, unknown>, exitCode?: number): void;
    handleToolFailure(sessionId: string, toolName: string, error: string): void;
    handleStop(sessionId: string): void;
    getSessionSummary(sessionId: string): SessionSummary;
    private isTestRunnerCommand;
}
//# sourceMappingURL=signal-collector.d.ts.map