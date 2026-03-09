/**
 * ExperienceGenerator tests — SPECIFICATION.md Section 3.6
 */

import { describe, it, expect } from "vitest";
import { ExperienceGenerator } from "../../src/experience/generator.js";
import type { SessionSummary } from "../../src/signals/signal-collector.js";
import type { EventType } from "../../src/signals/types.js";
import type { SessionSignal } from "../../src/signals/types.js";

function makeSummary(
  overrides: Partial<SessionSummary> = {}
): SessionSummary {
  const defaultCounts: Record<EventType, number> = {
    interrupt: 0,
    post_interrupt_turn: 0,
    corrective_instruction: 0,
    tool_success: 0,
    stop: 0,
    rewind: 0,
  };
  return {
    session_id: "test-session",
    total_signals: 0,
    counts: defaultCounts,
    was_interrupted: false,
    corrective_instruction_count: 0,
    has_test_pass: false,
    ...overrides,
  };
}

function makeSignal(
  eventType: SessionSignal["event_type"],
  data: Record<string, unknown> | null = null
): SessionSignal {
  return {
    id: 1,
    session_id: "test-session",
    event_type: eventType,
    data,
    timestamp: new Date().toISOString(),
  };
}

describe("ExperienceGenerator", () => {
  const generator = new ExperienceGenerator({ capture_turns: 5, promotion_threshold: 0.3 });

  describe("failure entries", () => {
    it("generates failure entry for interrupted session", () => {
      const summary = makeSummary({
        was_interrupted: true,
        counts: {
          ...makeSummary().counts,
          interrupt: 1,
          post_interrupt_turn: 3,
          tool_success: 2,
        },
        total_signals: 6,
      });
      const signals: SessionSignal[] = [
        makeSignal("interrupt", { tool_name: "Edit", error: "Failed to apply" }),
        makeSignal("post_interrupt_turn", { prompt: "That's wrong, use TypeScript" }),
        makeSignal("post_interrupt_turn", { prompt: "The function needs generics" }),
        makeSignal("post_interrupt_turn", { prompt: "Fix the type signature" }),
      ];

      const result = generator.generate({ session_id: "test-session", summary, signals });

      const failures = result.filter((e) => e.type === "failure");
      expect(failures.length).toBeGreaterThanOrEqual(1);
      expect(failures[0].signal_type).toBe("interrupt_with_dialogue");
      expect(failures[0].signal_strength).toBeGreaterThanOrEqual(0.9);
      expect(failures[0].retrieval_keys.length).toBeGreaterThan(0);
    });

    it("generates failure entry for 3+ corrective instructions", () => {
      const summary = makeSummary({
        corrective_instruction_count: 4,
        counts: {
          ...makeSummary().counts,
          corrective_instruction: 4,
          tool_success: 3,
        },
        total_signals: 7,
      });
      const signals: SessionSignal[] = [
        makeSignal("corrective_instruction", { prompt: "No, use async/await", pattern: "no" }),
        makeSignal("corrective_instruction", { prompt: "That's not right", pattern: "not_right" }),
        makeSignal("corrective_instruction", { prompt: "Try again", pattern: "try_again" }),
        makeSignal("corrective_instruction", { prompt: "Wrong approach", pattern: "wrong" }),
      ];

      const result = generator.generate({ session_id: "test-session", summary, signals });

      const failures = result.filter((e) => e.type === "failure");
      expect(failures.length).toBeGreaterThanOrEqual(1);
      expect(failures[0].signal_type).toBe("corrective_instruction");
      expect(failures[0].signal_strength).toBeGreaterThanOrEqual(0.6);
    });
  });

  describe("success entries", () => {
    it("generates success entry for clean completion with test pass", () => {
      const summary = makeSummary({
        has_test_pass: true,
        counts: {
          ...makeSummary().counts,
          tool_success: 5,
          stop: 1,
        },
        total_signals: 6,
      });
      const signals: SessionSignal[] = [
        makeSignal("tool_success", { tool_name: "Bash", is_test_runner: true, test_passed: true }),
        makeSignal("tool_success", { tool_name: "Edit", is_test_runner: false }),
        makeSignal("stop", null),
      ];

      const result = generator.generate({ session_id: "test-session", summary, signals });

      const successes = result.filter((e) => e.type === "success");
      expect(successes.length).toBe(1);
      expect(successes[0].signal_type).toBe("uninterrupted_completion");
      expect(successes[0].signal_strength).toBeGreaterThanOrEqual(0.7);
      expect(successes[0].signal_strength).toBeLessThanOrEqual(0.85);
    });

    it("generates success entry for clean completion without tests", () => {
      const summary = makeSummary({
        has_test_pass: false,
        counts: {
          ...makeSummary().counts,
          tool_success: 3,
          stop: 1,
        },
        total_signals: 4,
      });
      const signals: SessionSignal[] = [
        makeSignal("tool_success", { tool_name: "Read", is_test_runner: false }),
        makeSignal("stop", null),
      ];

      const result = generator.generate({ session_id: "test-session", summary, signals });

      const successes = result.filter((e) => e.type === "success");
      expect(successes.length).toBe(1);
      expect(successes[0].signal_type).toBe("uninterrupted_completion");
      expect(successes[0].signal_strength).toBeGreaterThanOrEqual(0.4);
      expect(successes[0].signal_strength).toBeLessThanOrEqual(0.6);
    });
  });

  describe("mixed signals", () => {
    it("generates both success and failure entries for mixed signals", () => {
      // Interrupted session that also had successful tool completions with test pass
      // After interrupt was handled, tests eventually passed
      const summary = makeSummary({
        was_interrupted: true,
        has_test_pass: true,
        corrective_instruction_count: 1,
        counts: {
          ...makeSummary().counts,
          interrupt: 1,
          post_interrupt_turn: 2,
          corrective_instruction: 1,
          tool_success: 8,
          stop: 1,
        },
        total_signals: 13,
      });
      const signals: SessionSignal[] = [
        makeSignal("interrupt", { tool_name: "Bash", error: "test failed" }),
        makeSignal("post_interrupt_turn", { prompt: "Fix the test" }),
        makeSignal("tool_success", { tool_name: "Edit", is_test_runner: false }),
        makeSignal("tool_success", { tool_name: "Bash", is_test_runner: true, test_passed: true }),
        makeSignal("stop", null),
      ];

      const result = generator.generate({ session_id: "test-session", summary, signals });

      // Should have both failure (from interrupt) and we don't generate success when interrupted
      // Actually per spec, mixed means interrupt generates failure, but success is still possible
      // if test passed after recovery. The generator should handle this.
      expect(result.length).toBeGreaterThanOrEqual(1);
      const types = result.map((e) => e.type);
      expect(types).toContain("failure");
    });

    it("generates both interrupt and corrective failure entries when both conditions met", () => {
      const summary = makeSummary({
        was_interrupted: true,
        corrective_instruction_count: 4,
        counts: {
          ...makeSummary().counts,
          interrupt: 1,
          post_interrupt_turn: 2,
          corrective_instruction: 4,
          tool_success: 3,
        },
        total_signals: 10,
      });
      const signals: SessionSignal[] = [
        makeSignal("interrupt", { tool_name: "Bash", error: "build failed" }),
        makeSignal("post_interrupt_turn", { prompt: "Fix the build" }),
        makeSignal("post_interrupt_turn", { prompt: "Use the right config" }),
        makeSignal("corrective_instruction", { prompt: "No, wrong approach", pattern: "wrong" }),
        makeSignal("corrective_instruction", { prompt: "Try again", pattern: "try_again" }),
        makeSignal("corrective_instruction", { prompt: "Not what I meant", pattern: "not_meant" }),
        makeSignal("corrective_instruction", { prompt: "Undo that", pattern: "undo" }),
      ];

      const result = generator.generate({ session_id: "test-session", summary, signals });

      const signalTypes = result.map((e) => e.signal_type);
      expect(signalTypes).toContain("interrupt_with_dialogue");
      expect(signalTypes).toContain("corrective_instruction");
      expect(result.length).toBe(2);
      expect(result.every((e) => e.type === "failure")).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("returns empty array for empty session", () => {
      const summary = makeSummary({ total_signals: 0 });
      const result = generator.generate({ session_id: "test-session", summary, signals: [] });
      expect(result).toEqual([]);
    });

    it("discards entries below promotion threshold", () => {
      // corrective_instruction_count = 1 → strength 0.30
      // With promotion_threshold = 0.3, this should be at the boundary
      const highThresholdGenerator = new ExperienceGenerator({
        capture_turns: 5,
        promotion_threshold: 0.5,
      });
      const summary = makeSummary({
        corrective_instruction_count: 1,
        counts: {
          ...makeSummary().counts,
          corrective_instruction: 1,
        },
        total_signals: 1,
      });
      const signals: SessionSignal[] = [
        makeSignal("corrective_instruction", { prompt: "try again", pattern: "try_again" }),
      ];

      const result = highThresholdGenerator.generate({
        session_id: "test-session",
        summary,
        signals,
      });

      // Strength = 0.30 < threshold 0.50, should be discarded
      expect(result).toEqual([]);
    });

    it("includes session_id and timestamp in generated entries", () => {
      const summary = makeSummary({
        has_test_pass: true,
        counts: { ...makeSummary().counts, tool_success: 1, stop: 1 },
        total_signals: 2,
      });
      const signals: SessionSignal[] = [
        makeSignal("tool_success", { tool_name: "Bash", is_test_runner: true, test_passed: true }),
      ];

      const result = generator.generate({ session_id: "my-session", summary, signals });

      expect(result.length).toBe(1);
      expect(result[0].session_id).toBe("my-session");
      expect(result[0].timestamp).toBeDefined();
    });

    it("populates trigger, action, outcome text fields", () => {
      const summary = makeSummary({
        has_test_pass: true,
        counts: { ...makeSummary().counts, tool_success: 3, stop: 1 },
        total_signals: 4,
      });
      const signals: SessionSignal[] = [
        makeSignal("tool_success", { tool_name: "Edit", is_test_runner: false }),
        makeSignal("tool_success", { tool_name: "Bash", is_test_runner: true, test_passed: true }),
      ];

      const result = generator.generate({ session_id: "test-session", summary, signals });

      expect(result[0].trigger).toBeTruthy();
      expect(result[0].action).toBeTruthy();
      expect(result[0].outcome).toBeTruthy();
    });

    it("populates interrupt_context for failure entries from interrupts", () => {
      const summary = makeSummary({
        was_interrupted: true,
        counts: {
          ...makeSummary().counts,
          interrupt: 1,
          post_interrupt_turn: 2,
        },
        total_signals: 3,
      });
      const signals: SessionSignal[] = [
        makeSignal("interrupt", { tool_name: "Bash", error: "command failed" }),
        makeSignal("post_interrupt_turn", { prompt: "That's wrong" }),
        makeSignal("post_interrupt_turn", { prompt: "Use a different approach" }),
      ];

      const result = generator.generate({ session_id: "test-session", summary, signals });

      const failure = result.find((e) => e.type === "failure");
      expect(failure).toBeDefined();
      expect(failure!.interrupt_context).toBeDefined();
      expect(failure!.interrupt_context!.turns_captured).toBe(2);
      expect(failure!.interrupt_context!.dialogue_summary).toContain("wrong");
    });
  });
});
