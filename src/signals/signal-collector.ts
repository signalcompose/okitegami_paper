/**
 * SignalCollector — stateless hook event processor
 * SPECIFICATION.md Sections 3.2–3.5
 *
 * Each method opens/queries SQLite via SessionSignalStore,
 * writes signals, and returns. No in-memory session state.
 */

import type { SessionSignalStore } from "./session-store.js";
import type { EventType } from "./types.js";

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

export class SignalCollector {
  constructor(
    private store: SessionSignalStore,
    private options: SignalCollectorOptions
  ) {}

  handleInterrupt(sessionId: string, toolName: string, error: string): void {
    this.store.addSignal(sessionId, "interrupt", {
      tool_name: toolName,
      error,
    });
  }

  handleUserPrompt(sessionId: string, prompt: string): void {
    // Check if session was interrupted and we're still within capture window
    const counts = this.store.countSpecificTypes(sessionId, "interrupt", "post_interrupt_turn");
    if (counts.interrupt > 0 && counts.post_interrupt_turn < this.options.capture_turns) {
      this.store.addSignal(sessionId, "post_interrupt_turn", { prompt });
    }

    // Corrective instruction detection is handled by Claude Code
    // via acm_record_signal MCP tool (see formatSignalInstruction in src/retrieval/injector.ts)
  }

  handleToolSuccess(
    sessionId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    exitCode?: number
  ): void {
    const isTestRunner = this.isTestRunnerCommand(toolName, toolInput);
    const testPassed = isTestRunner && exitCode === 0;

    this.store.addSignal(sessionId, "tool_success", {
      tool_name: toolName,
      is_test_runner: isTestRunner,
      test_passed: testPassed,
    });
  }

  handleToolFailure(sessionId: string, toolName: string, error: string): void {
    this.store.addSignal(sessionId, "tool_failure", {
      tool_name: toolName,
      error,
    });
  }

  handleStop(sessionId: string, lastAssistantMessage?: string): void {
    if (lastAssistantMessage) {
      const truncated = lastAssistantMessage.slice(0, 500);
      this.store.addSignal(sessionId, "stop", { last_assistant_message: truncated });
    } else {
      this.store.addSignal(sessionId, "stop", null);
    }
  }

  getSessionSummary(sessionId: string): SessionSummary {
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

  private isTestRunnerCommand(toolName: string, toolInput: Record<string, unknown>): boolean {
    if (toolName !== "Bash") return false;
    const command = toolInput.command;
    if (typeof command !== "string") return false;
    return TEST_RUNNER_PATTERNS.some((pattern) => pattern.test(command));
  }
}
