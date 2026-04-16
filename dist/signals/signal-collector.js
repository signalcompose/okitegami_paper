/**
 * SignalCollector — stateless hook event processor
 * SPECIFICATION.md Sections 3.2–3.5
 *
 * Each method opens/queries SQLite via SessionSignalStore,
 * writes signals, and returns. No in-memory session state.
 */
const TEST_RUNNER_PATTERNS = [
    /\bvitest\b/,
    /\bjest\b/,
    /\bmocha\b/,
    /\bnpm\s+(?:run\s+)?test\b/,
    /\byarn\s+test\b/,
    /\bpnpm\s+test\b/,
    /\bpytest\b/,
    /\bcargo\s+test\b/,
    /\bgo\s+test\b/,
];
export class SignalCollector {
    store;
    options;
    constructor(store, options) {
        this.store = store;
        this.options = options;
    }
    handleInterrupt(sessionId, toolName, error) {
        this.store.addSignal(sessionId, "interrupt", {
            tool_name: toolName,
            error,
        });
    }
    handleUserPrompt(sessionId, prompt) {
        // Check if session was interrupted and we're still within capture window
        const counts = this.store.countSpecificTypes(sessionId, "interrupt", "post_interrupt_turn");
        if (counts.interrupt > 0 && counts.post_interrupt_turn < this.options.capture_turns) {
            this.store.addSignal(sessionId, "post_interrupt_turn", { prompt });
        }
        // Corrective instruction detection is handled by transcript analysis
        // at session-end (see src/signals/corrective-classifier.ts)
    }
    handleToolSuccess(sessionId, toolName, toolInput, exitCode) {
        const isTestRunner = this.isTestRunnerCommand(toolName, toolInput);
        const testPassed = isTestRunner && exitCode === 0;
        this.store.addSignal(sessionId, "tool_success", {
            tool_name: toolName,
            is_test_runner: isTestRunner,
            test_passed: testPassed,
        });
    }
    handleToolFailure(sessionId, toolName, error) {
        this.store.addSignal(sessionId, "tool_failure", {
            tool_name: toolName,
            error,
        });
    }
    handleStop(sessionId, lastAssistantMessage) {
        if (lastAssistantMessage) {
            const truncated = lastAssistantMessage.slice(0, 500);
            this.store.addSignal(sessionId, "stop", { last_assistant_message: truncated });
        }
        else {
            this.store.addSignal(sessionId, "stop", null);
        }
    }
    getSessionSummary(sessionId, options) {
        const after = options?.after;
        const counts = after
            ? this.store.countByTypeAfter(sessionId, after)
            : this.store.countByType(sessionId);
        const totalSignals = Object.values(counts).reduce((a, b) => a + b, 0);
        return {
            session_id: sessionId,
            total_signals: totalSignals,
            counts,
            was_interrupted: counts.interrupt > 0,
            corrective_instruction_count: counts.corrective_instruction,
            has_test_pass: after
                ? this.store.hasTestPassAfter(sessionId, after)
                : this.store.hasTestPass(sessionId),
        };
    }
    isTestRunnerCommand(toolName, toolInput) {
        if (toolName !== "Bash")
            return false;
        const command = toolInput.command;
        if (typeof command !== "string")
            return false;
        return TEST_RUNNER_PATTERNS.some((pattern) => pattern.test(command));
    }
}
//# sourceMappingURL=signal-collector.js.map