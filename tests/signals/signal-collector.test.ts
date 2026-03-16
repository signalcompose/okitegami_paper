import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initializeDatabase } from "../../src/store/schema.js";
import { SessionSignalStore } from "../../src/signals/session-store.js";
import { SignalCollector } from "../../src/signals/signal-collector.js";
import type { AdaptedDatabase } from "../../src/store/sqlite-adapter.js";

describe("SignalCollector", () => {
  let db: AdaptedDatabase;
  let store: SessionSignalStore;
  let collector: SignalCollector;
  const sessionId = "test-session-1";

  beforeEach(async () => {
    db = await initializeDatabase(":memory:");
    store = new SessionSignalStore(db);
    collector = new SignalCollector(store, { capture_turns: 3 });
  });

  afterEach(() => {
    db?.close();
  });

  describe("handleInterrupt", () => {
    it("records an interrupt signal", () => {
      collector.handleInterrupt(sessionId, "Bash", "User interrupted");

      const signals = store.getBySession(sessionId);
      expect(signals).toHaveLength(1);
      expect(signals[0].event_type).toBe("interrupt");
      expect(signals[0].data).toEqual({
        tool_name: "Bash",
        error: "User interrupted",
      });
    });
  });

  describe("handleUserPrompt", () => {
    it("records post_interrupt_turn when session was interrupted", () => {
      // First, interrupt the session
      collector.handleInterrupt(sessionId, "Bash", "interrupted");

      // Then submit a user prompt
      collector.handleUserPrompt(sessionId, "Please fix the bug properly");

      const signals = store.getBySession(sessionId);
      expect(signals).toHaveLength(2);
      expect(signals[1].event_type).toBe("post_interrupt_turn");
      expect(signals[1].data).toEqual(
        expect.objectContaining({ prompt: "Please fix the bug properly" })
      );
    });

    it("does not detect corrective instruction via regex (delegated to Claude)", () => {
      collector.handleUserPrompt(sessionId, "That's wrong, try again");

      const signals = store.getBySession(sessionId);
      const corrective = signals.find((s) => s.event_type === "corrective_instruction");
      expect(corrective).toBeUndefined();
    });

    it("does not record post_interrupt_turn without prior interrupt", () => {
      collector.handleUserPrompt(sessionId, "Please implement login");

      const signals = store.getBySession(sessionId);
      const postInterrupt = signals.find((s) => s.event_type === "post_interrupt_turn");
      expect(postInterrupt).toBeUndefined();
    });

    it("respects capture_turns limit for post-interrupt tracking", () => {
      collector.handleInterrupt(sessionId, "Bash", "interrupted");

      // Submit capture_turns (3) + 1 prompts
      collector.handleUserPrompt(sessionId, "Turn 1");
      collector.handleUserPrompt(sessionId, "Turn 2");
      collector.handleUserPrompt(sessionId, "Turn 3");
      collector.handleUserPrompt(sessionId, "Turn 4 - should not be captured");

      const signals = store.getBySession(sessionId);
      const postInterruptSignals = signals.filter((s) => s.event_type === "post_interrupt_turn");
      expect(postInterruptSignals).toHaveLength(3);
    });

    it("does not detect Japanese corrective instruction via regex (delegated to Claude)", () => {
      collector.handleUserPrompt(sessionId, "それは違う、こうして");

      const signals = store.getBySession(sessionId);
      const corrective = signals.find((s) => s.event_type === "corrective_instruction");
      expect(corrective).toBeUndefined();
    });
  });

  describe("handleToolSuccess", () => {
    it("records a tool_success signal", () => {
      collector.handleToolSuccess(sessionId, "Read", { file: "test.ts" });

      const signals = store.getBySession(sessionId);
      expect(signals).toHaveLength(1);
      expect(signals[0].event_type).toBe("tool_success");
      expect(signals[0].data).toEqual(expect.objectContaining({ tool_name: "Read" }));
    });

    it("detects test runner with success", () => {
      collector.handleToolSuccess(
        sessionId,
        "Bash",
        { command: "npm run test" },
        0 // exitCode from tool result
      );

      const signals = store.getBySession(sessionId);
      expect(signals[0].data).toEqual(
        expect.objectContaining({
          is_test_runner: true,
          test_passed: true,
        })
      );
    });

    it("detects test runner with failure", () => {
      collector.handleToolSuccess(
        sessionId,
        "Bash",
        { command: "vitest run" },
        1 // exitCode from tool result
      );

      const signals = store.getBySession(sessionId);
      expect(signals[0].data).toEqual(
        expect.objectContaining({
          is_test_runner: true,
          test_passed: false,
        })
      );
    });

    it("does not flag non-test commands as test runner", () => {
      collector.handleToolSuccess(sessionId, "Bash", {
        command: "git status",
        exit_code: 0,
      });

      const signals = store.getBySession(sessionId);
      expect(signals[0].data).toEqual(expect.objectContaining({ is_test_runner: false }));
    });
  });

  describe("handleStop", () => {
    it("records a stop signal", () => {
      collector.handleStop(sessionId);

      const signals = store.getBySession(sessionId);
      expect(signals).toHaveLength(1);
      expect(signals[0].event_type).toBe("stop");
    });
  });

  describe("getSessionSummary", () => {
    it("returns a summary of signals for a session", () => {
      collector.handleInterrupt(sessionId, "Bash", "interrupted");
      collector.handleUserPrompt(sessionId, "That's wrong");
      collector.handleToolSuccess(sessionId, "Read", { file: "x.ts" });
      collector.handleStop(sessionId);

      const summary = collector.getSessionSummary(sessionId);

      expect(summary.session_id).toBe(sessionId);
      // interrupt + post_interrupt_turn + tool_success + stop = 4
      // (corrective_instruction no longer auto-detected via regex)
      expect(summary.total_signals).toBe(4);
      expect(summary.counts.interrupt).toBe(1);
      expect(summary.counts.corrective_instruction).toBe(0);
      expect(summary.counts.post_interrupt_turn).toBe(1);
      expect(summary.counts.tool_success).toBe(1);
      expect(summary.counts.stop).toBe(1);
      expect(summary.was_interrupted).toBe(true);
      expect(summary.corrective_instruction_count).toBe(0);
    });

    it("returns empty summary for unknown session", () => {
      const summary = collector.getSessionSummary("nonexistent");

      expect(summary.total_signals).toBe(0);
      expect(summary.was_interrupted).toBe(false);
      expect(summary.corrective_instruction_count).toBe(0);
    });
  });
});
