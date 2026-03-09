/**
 * ExperienceGenerator — SPECIFICATION.md Section 3.6
 *
 * Stateless: receives SessionSummary + signals, returns ExperienceEntry candidates.
 * Caller is responsible for persistence via ExperienceStore.create().
 */

import type { ExperienceEntry } from "../store/types.js";
import type { SessionSummary } from "../signals/signal-collector.js";
import type { SessionSignal } from "../signals/types.js";
import { computeFailureStrength, computeSuccessStrength } from "./scoring.js";
import { extractRetrievalKeys } from "./keywords.js";

export interface GenerationInput {
  session_id: string;
  summary: SessionSummary;
  signals: SessionSignal[];
}

export type GenerationResult = Array<Omit<ExperienceEntry, "id">>;

export interface ExperienceGeneratorOptions {
  capture_turns: number;
  promotion_threshold: number;
}

export class ExperienceGenerator {
  constructor(private options: ExperienceGeneratorOptions) {}

  generate(input: GenerationInput): GenerationResult {
    const { session_id, summary, signals } = input;

    if (summary.total_signals === 0 && signals.length === 0) {
      return [];
    }

    const results: GenerationResult = [];
    const timestamp = new Date().toISOString();
    const retrievalKeys = extractRetrievalKeys(signals);

    // Failure entry from interrupt
    if (summary.was_interrupted) {
      const strength = computeFailureStrength(summary, this.options.capture_turns);
      if (strength !== null && strength >= this.options.promotion_threshold) {
        results.push({
          type: "failure",
          trigger: this.buildTrigger(signals, "interrupt"),
          action: this.buildAction(signals, "interrupt"),
          outcome: this.buildOutcome(signals, "interrupt"),
          retrieval_keys: retrievalKeys,
          signal_strength: strength,
          signal_type: "interrupt_with_dialogue",
          session_id,
          timestamp,
          interrupt_context: this.buildInterruptContext(signals),
        });
      }
    }

    // Failure entry from corrective instructions (independent of interrupt — different signal types)
    if (summary.corrective_instruction_count >= 3) {
      const corrStrength = this.computeCorrective3PlusStrength(summary);
      if (corrStrength !== null && corrStrength >= this.options.promotion_threshold) {
        results.push({
          type: "failure",
          trigger: this.buildTrigger(signals, "corrective"),
          action: this.buildAction(signals, "corrective"),
          outcome: this.buildOutcome(signals, "corrective"),
          retrieval_keys: retrievalKeys,
          signal_strength: corrStrength,
          signal_type: "corrective_instruction",
          session_id,
          timestamp,
        });
      }
    }

    // Success entry: only if not interrupted and corrective < 3
    if (!summary.was_interrupted && summary.corrective_instruction_count < 3) {
      const totalToolCalls = summary.total_signals;
      const strength = computeSuccessStrength(summary, totalToolCalls);
      if (strength !== null && strength >= this.options.promotion_threshold) {
        results.push({
          type: "success",
          trigger: this.buildTrigger(signals, "success"),
          action: this.buildAction(signals, "success"),
          outcome: this.buildOutcome(signals, "success"),
          retrieval_keys: retrievalKeys,
          signal_strength: strength,
          signal_type: "uninterrupted_completion",
          session_id,
          timestamp,
        });
      }
    }

    return results;
  }

  private buildTrigger(signals: SessionSignal[], context: string): string {
    if (context === "interrupt") {
      const interrupt = signals.find((s) => s.event_type === "interrupt");
      if (interrupt?.data) {
        return `Tool ${interrupt.data.tool_name} failed: ${interrupt.data.error}`;
      }
      return "Session interrupted by user";
    }
    if (context === "corrective") {
      const corrections = signals.filter(
        (s) => s.event_type === "corrective_instruction"
      );
      const firstPrompt = corrections[0]?.data?.prompt;
      return typeof firstPrompt === "string"
        ? `Corrective feedback: ${firstPrompt.slice(0, 100)}`
        : "Multiple corrective instructions received";
    }
    // success
    const tools = this.getUniqueToolNames(signals);
    return tools.length > 0
      ? `Session using: ${tools.join(", ")}`
      : "Session completed";
  }

  private buildAction(signals: SessionSignal[], context: string): string {
    const tools = this.getUniqueToolNames(signals);
    const toolStr = tools.length > 0 ? tools.join(", ") : "unknown tools";

    if (context === "interrupt") {
      return `Agent used ${toolStr} before user interrupted`;
    }
    if (context === "corrective") {
      return `Agent used ${toolStr}, received corrective feedback`;
    }
    return `Agent completed task using ${toolStr}`;
  }

  private buildOutcome(signals: SessionSignal[], context: string): string {
    if (context === "interrupt") {
      const postTurns = signals.filter(
        (s) => s.event_type === "post_interrupt_turn"
      );
      const prompts = postTurns
        .map((s) => (s.data?.prompt as string) ?? "")
        .filter(Boolean);
      return prompts.length > 0
        ? `User feedback: ${prompts.join("; ").slice(0, 200)}`
        : "User interrupted the session";
    }
    if (context === "corrective") {
      const corrections = signals.filter(
        (s) => s.event_type === "corrective_instruction"
      );
      const count = corrections.length;
      return `Received ${count} corrective instruction${count > 1 ? "s" : ""}`;
    }
    // success
    const hasTestPass = signals.some(
      (s) =>
        s.event_type === "tool_success" && s.data?.test_passed === true
    );
    return hasTestPass
      ? "Task completed with passing tests"
      : "Task completed without test verification";
  }

  private buildInterruptContext(
    signals: SessionSignal[]
  ): ExperienceEntry["interrupt_context"] {
    const postTurns = signals.filter(
      (s) => s.event_type === "post_interrupt_turn"
    );
    const prompts = postTurns
      .map((s) => (s.data?.prompt as string) ?? "")
      .filter(Boolean);

    return {
      turns_captured: postTurns.length,
      dialogue_summary: prompts.join("; ").slice(0, 500),
    };
  }

  private computeCorrective3PlusStrength(summary: SessionSummary): number | null {
    const count = summary.corrective_instruction_count;
    if (count < 3) return null;
    // SPECIFICATION Section 2.2: Corrective instruction (3+) → 0.60–0.80
    return Math.min(0.8, Math.round((0.6 + (count - 3) * 0.05) * 1000) / 1000);
  }

  private getUniqueToolNames(signals: SessionSignal[]): string[] {
    const tools = new Set<string>();
    for (const signal of signals) {
      if (signal.data?.tool_name && typeof signal.data.tool_name === "string") {
        tools.add(signal.data.tool_name);
      }
    }
    return [...tools];
  }
}
