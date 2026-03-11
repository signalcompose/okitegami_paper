/**
 * SignalCollector — stateless hook event processor
 * SPECIFICATION.md Sections 3.2–3.5
 *
 * Each method opens/queries SQLite via SessionSignalStore,
 * writes signals, and returns. No in-memory session state.
 */
import { detectCorrectiveInstruction } from "./patterns.js";
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
        // Check for corrective instruction
        const match = detectCorrectiveInstruction(prompt);
        if (match) {
            this.store.addSignal(sessionId, "corrective_instruction", {
                prompt,
                pattern: match.pattern,
                language: match.language,
            });
        }
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
    handleStop(sessionId) {
        this.store.addSignal(sessionId, "stop", null);
    }
    getSessionSummary(sessionId) {
        const counts = this.store.countByType(sessionId);
        const totalSignals = Object.values(counts).reduce((a, b) => a + b, 0);
        return {
            session_id: sessionId,
            total_signals: totalSignals,
            counts,
            was_interrupted: counts.interrupt > 0,
            corrective_instruction_count: counts.corrective_instruction,
            has_test_pass: this.store.hasTestPass(sessionId),
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