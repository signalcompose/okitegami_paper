/**
 * ExperienceGenerator — SPECIFICATION.md Section 3.6
 *
 * Stateless: receives SessionSummary + signals, returns ExperienceEntry candidates.
 * Caller is responsible for persistence via ExperienceStore.create().
 */
import { computeFailureStrength, computeSuccessStrength } from "./scoring.js";
import { extractRetrievalKeys } from "./keywords.js";
export class ExperienceGenerator {
    options;
    constructor(options) {
        this.options = options;
    }
    generate(input) {
        const { session_id, summary, signals } = input;
        if (summary.total_signals === 0) {
            return [];
        }
        const results = [];
        const timestamp = new Date().toISOString();
        const idx = this.buildSignalIndex(signals);
        // Lazy: only extract keys if at least one entry will be generated
        let retrievalKeys = null;
        const getKeys = () => {
            if (retrievalKeys === null) {
                retrievalKeys = extractRetrievalKeys(signals);
            }
            return retrievalKeys;
        };
        // Failure entry: corrective-driven (interrupt is a modifier, not primary signal)
        const failureStrength = computeFailureStrength(summary);
        if (failureStrength !== null && failureStrength >= this.options.promotion_threshold) {
            const context = summary.was_interrupted ? "interrupt" : "corrective";
            const signalType = summary.was_interrupted
                ? "interrupt_with_dialogue"
                : "corrective_instruction";
            results.push({
                type: "failure",
                trigger: this.buildTrigger(idx, context),
                action: this.buildAction(idx, context),
                outcome: this.buildOutcome(idx, context),
                retrieval_keys: getKeys(),
                signal_strength: failureStrength,
                signal_type: signalType,
                session_id,
                timestamp,
                ...(summary.was_interrupted ? { interrupt_context: this.buildInterruptContext(idx) } : {}),
            });
        }
        // Success entry: only when corrective_instruction_count == 0 (failure strength was null)
        if (failureStrength === null) {
            const totalToolCalls = summary.counts.tool_success + summary.counts.tool_failure;
            const strength = computeSuccessStrength(summary, totalToolCalls);
            if (strength !== null && strength >= this.options.promotion_threshold) {
                results.push({
                    type: "success",
                    trigger: this.buildTrigger(idx, "success"),
                    action: this.buildAction(idx, "success"),
                    outcome: this.buildOutcome(idx, "success"),
                    retrieval_keys: getKeys(),
                    signal_strength: strength,
                    signal_type: "uninterrupted_completion",
                    session_id,
                    timestamp,
                });
            }
        }
        return results;
    }
    buildSignalIndex(signals) {
        const byType = new Map();
        const toolNames = new Set();
        const postInterruptPrompts = [];
        let hasTestPass = false;
        for (const signal of signals) {
            const existing = byType.get(signal.event_type);
            if (existing) {
                existing.push(signal);
            }
            else {
                byType.set(signal.event_type, [signal]);
            }
            if (signal.data?.tool_name && typeof signal.data.tool_name === "string") {
                toolNames.add(signal.data.tool_name);
            }
            if (signal.event_type === "post_interrupt_turn") {
                const prompt = signal.data?.prompt;
                if (typeof prompt === "string" && prompt) {
                    postInterruptPrompts.push(prompt);
                }
            }
            if (signal.event_type === "tool_success" && signal.data?.test_passed === true) {
                hasTestPass = true;
            }
        }
        return { byType, toolNames: [...toolNames], postInterruptPrompts, hasTestPass };
    }
    buildTrigger(idx, context) {
        if (context === "interrupt") {
            const interrupts = idx.byType.get("interrupt");
            const interrupt = interrupts?.[0];
            if (interrupt?.data) {
                return `Tool ${interrupt.data.tool_name} failed: ${interrupt.data.error}`;
            }
            return "Session interrupted by user";
        }
        if (context === "corrective") {
            const corrections = idx.byType.get("corrective_instruction") ?? [];
            const firstPrompt = corrections[0]?.data?.prompt;
            return typeof firstPrompt === "string"
                ? `Corrective feedback: ${firstPrompt.slice(0, 100)}`
                : "Multiple corrective instructions received";
        }
        return idx.toolNames.length > 0
            ? `Session using: ${idx.toolNames.join(", ")}`
            : "Session completed";
    }
    buildAction(idx, context) {
        const toolStr = idx.toolNames.length > 0 ? idx.toolNames.join(", ") : "unknown tools";
        if (context === "interrupt") {
            return `Agent used ${toolStr} before user interrupted`;
        }
        if (context === "corrective") {
            return `Agent used ${toolStr}, received corrective feedback`;
        }
        return `Agent completed task using ${toolStr}`;
    }
    buildOutcome(idx, context) {
        if (context === "interrupt") {
            return idx.postInterruptPrompts.length > 0
                ? `User feedback: ${idx.postInterruptPrompts.join("; ").slice(0, 200)}`
                : "User interrupted the session";
        }
        if (context === "corrective") {
            const corrections = idx.byType.get("corrective_instruction") ?? [];
            const count = corrections.length;
            return `Received ${count} corrective instruction${count > 1 ? "s" : ""}`;
        }
        return idx.hasTestPass
            ? "Task completed with passing tests"
            : "Task completed without test verification";
    }
    buildInterruptContext(idx) {
        return {
            turns_captured: idx.postInterruptPrompts.length,
            dialogue_summary: idx.postInterruptPrompts.join("; ").slice(0, 500),
        };
    }
}
//# sourceMappingURL=generator.js.map