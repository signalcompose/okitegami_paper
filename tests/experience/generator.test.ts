/**
 * ExperienceGenerator tests — SPECIFICATION.md Section 3.6
 *
 * Revised: Interrupt alone is ambiguous (no experience generated).
 * Corrective instruction count is the primary failure signal.
 * Single failure entry per session (corrective-driven).
 */

import { describe, it, expect } from "vitest";
import { ExperienceGenerator } from "../../src/experience/generator.js";
import type { SessionSignal } from "../../src/signals/types.js";
import { makeSummary, makeSignal } from "./helpers.js";

describe("ExperienceGenerator", () => {
  const generator = new ExperienceGenerator({ capture_turns: 5, promotion_threshold: 0.3 });

  describe("failure entries", () => {
    it("generates no entry for interrupt + 0 corrective (ambiguous)", () => {
      const summary = makeSummary({
        was_interrupted: true,
        corrective_instruction_count: 0,
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
      expect(result).toEqual([]);
    });

    it("generates failure entry for corrective instructions (3+)", () => {
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
      expect(failures).toHaveLength(1);
      expect(failures[0].signal_type).toBe("corrective_instruction");
      expect(failures[0].signal_strength).toBeGreaterThanOrEqual(0.6);
    });

    it("generates amplified failure for interrupt + corrective", () => {
      const summary = makeSummary({
        was_interrupted: true,
        corrective_instruction_count: 3,
        counts: {
          ...makeSummary().counts,
          interrupt: 1,
          post_interrupt_turn: 2,
          corrective_instruction: 3,
        },
        total_signals: 6,
      });
      const signals: SessionSignal[] = [
        makeSignal("interrupt", { tool_name: "Bash", error: "build failed" }),
        makeSignal("post_interrupt_turn", { prompt: "Fix the build" }),
        makeSignal("corrective_instruction", { prompt: "Wrong approach", pattern: "wrong" }),
        makeSignal("corrective_instruction", { prompt: "Try again", pattern: "try_again" }),
        makeSignal("corrective_instruction", { prompt: "Not what I meant", pattern: "not_meant" }),
      ];

      const result = generator.generate({ session_id: "test-session", summary, signals });

      // Single failure entry (corrective-driven, interrupt as context)
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("failure");
      expect(result[0].signal_type).toBe("interrupt_with_dialogue");
      expect(result[0].interrupt_context).toBeDefined();
      // Interrupt boost should make strength higher than without interrupt
      expect(result[0].signal_strength).toBeGreaterThanOrEqual(0.7);
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

  describe("edge cases", () => {
    it("returns empty array for empty session", () => {
      const summary = makeSummary({ total_signals: 0 });
      const result = generator.generate({ session_id: "test-session", summary, signals: [] });
      expect(result).toEqual([]);
    });

    it("discards entries below promotion threshold", () => {
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

    it("uses tool_success + tool_failure for totalToolCalls in scoring", () => {
      const summary = makeSummary({
        has_test_pass: true,
        counts: {
          ...makeSummary().counts,
          tool_success: 3,
          tool_failure: 2,
          stop: 1,
        },
        total_signals: 6,
      });
      const signals: SessionSignal[] = [
        makeSignal("tool_success", { tool_name: "Edit", is_test_runner: false }),
        makeSignal("tool_success", { tool_name: "Bash", is_test_runner: true, test_passed: true }),
        makeSignal("tool_failure", { tool_name: "Bash", error: "command not found" }),
      ];

      const result = generator.generate({ session_id: "test-session", summary, signals });
      const success = result.find((e) => e.type === "success");
      expect(success).toBeDefined();
      // With tool_failure counted: ratio = 3/5 = 0.6
      // test pass: 0.7 + 0.6 * 0.15 = 0.79
      expect(success!.signal_strength).toBeCloseTo(0.79, 2);
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

    it("populates interrupt_context for interrupt + corrective failure", () => {
      const summary = makeSummary({
        was_interrupted: true,
        corrective_instruction_count: 2,
        counts: {
          ...makeSummary().counts,
          interrupt: 1,
          post_interrupt_turn: 2,
          corrective_instruction: 2,
        },
        total_signals: 5,
      });
      const signals: SessionSignal[] = [
        makeSignal("interrupt", { tool_name: "Bash", error: "command failed" }),
        makeSignal("post_interrupt_turn", { prompt: "That's wrong" }),
        makeSignal("post_interrupt_turn", { prompt: "Use a different approach" }),
        makeSignal("corrective_instruction", { prompt: "That's wrong", pattern: "wrong" }),
        makeSignal("corrective_instruction", {
          prompt: "Use a different approach",
          pattern: "diff",
        }),
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
