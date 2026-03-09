/**
 * ExperienceGenerator — SPECIFICATION.md Section 3.6
 *
 * Stateless: receives SessionSummary + signals, returns ExperienceEntry candidates.
 * Caller is responsible for persistence via ExperienceStore.create().
 */

import type { ExperienceEntry } from "../store/types.js";
import type { SessionSummary } from "../signals/signal-collector.js";
import type { EventType, SessionSignal } from "../signals/types.js";
import { computeFailureStrength, computeSuccessStrength, computeCorrectiveStrength } from "./scoring.js";
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

type EntryContext = "interrupt" | "corrective" | "success";

/** Pre-indexed signals to avoid repeated array scans */
interface SignalIndex {
  byType: Map<EventType, SessionSignal[]>;
  toolNames: string[];
  postInterruptPrompts: string[];
  hasTestPass: boolean;
}

export class ExperienceGenerator {
  constructor(private options: ExperienceGeneratorOptions) {}

  generate(input: GenerationInput): GenerationResult {
    const { session_id, summary, signals } = input;

    if (summary.total_signals === 0) {
      return [];
    }

    const results: GenerationResult = [];
    const timestamp = new Date().toISOString();
    const idx = this.buildSignalIndex(signals);

    // Lazy: only extract keys if at least one entry will be generated
    let retrievalKeys: string[] | null = null;
    const getKeys = () => {
      if (retrievalKeys === null) {
        retrievalKeys = extractRetrievalKeys(signals);
      }
      return retrievalKeys;
    };

    // Failure entry from interrupt
    if (summary.was_interrupted) {
      const strength = computeFailureStrength(summary, this.options.capture_turns);
      if (strength !== null && strength >= this.options.promotion_threshold) {
        results.push({
          type: "failure",
          trigger: this.buildTrigger(idx, "interrupt"),
          action: this.buildAction(idx, "interrupt"),
          outcome: this.buildOutcome(idx, "interrupt"),
          retrieval_keys: getKeys(),
          signal_strength: strength,
          signal_type: "interrupt_with_dialogue",
          session_id,
          timestamp,
          interrupt_context: this.buildInterruptContext(idx),
        });
      }
    }

    // Failure entry from corrective instructions (independent of interrupt — different signal types)
    if (summary.corrective_instruction_count >= 3) {
      const corrStrength = computeCorrectiveStrength(summary.corrective_instruction_count);
      if (corrStrength !== null && corrStrength >= this.options.promotion_threshold) {
        results.push({
          type: "failure",
          trigger: this.buildTrigger(idx, "corrective"),
          action: this.buildAction(idx, "corrective"),
          outcome: this.buildOutcome(idx, "corrective"),
          retrieval_keys: getKeys(),
          signal_strength: corrStrength,
          signal_type: "corrective_instruction",
          session_id,
          timestamp,
        });
      }
    }

    // Success entry: only if not interrupted and corrective < 3
    if (!summary.was_interrupted && summary.corrective_instruction_count < 3) {
      const totalToolCalls = summary.counts.tool_success;
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

  private buildSignalIndex(signals: SessionSignal[]): SignalIndex {
    const byType = new Map<EventType, SessionSignal[]>();
    const toolNames = new Set<string>();
    const postInterruptPrompts: string[] = [];
    let hasTestPass = false;

    for (const signal of signals) {
      const existing = byType.get(signal.event_type);
      if (existing) {
        existing.push(signal);
      } else {
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

  private buildTrigger(idx: SignalIndex, context: EntryContext): string {
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

  private buildAction(idx: SignalIndex, context: EntryContext): string {
    const toolStr = idx.toolNames.length > 0 ? idx.toolNames.join(", ") : "unknown tools";

    if (context === "interrupt") {
      return `Agent used ${toolStr} before user interrupted`;
    }
    if (context === "corrective") {
      return `Agent used ${toolStr}, received corrective feedback`;
    }
    return `Agent completed task using ${toolStr}`;
  }

  private buildOutcome(idx: SignalIndex, context: EntryContext): string {
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

  private buildInterruptContext(
    idx: SignalIndex
  ): ExperienceEntry["interrupt_context"] {
    return {
      turns_captured: idx.postInterruptPrompts.length,
      dialogue_summary: idx.postInterruptPrompts.join("; ").slice(0, 500),
    };
  }
}
