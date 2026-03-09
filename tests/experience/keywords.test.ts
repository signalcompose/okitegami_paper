/**
 * Retrieval key extraction tests
 */

import { describe, it, expect } from "vitest";
import { extractRetrievalKeys } from "../../src/experience/keywords.js";
import type { SessionSignal } from "../../src/signals/types.js";
import { makeSignal } from "./helpers.js";

describe("extractRetrievalKeys", () => {
  it("extracts tool_name from tool_success signals", () => {
    const signals: SessionSignal[] = [
      makeSignal("tool_success", { tool_name: "Bash", is_test_runner: false }),
      makeSignal("tool_success", { tool_name: "Read", is_test_runner: false }),
      makeSignal("tool_success", { tool_name: "Bash", is_test_runner: false }),
    ];
    const keys = extractRetrievalKeys(signals);
    expect(keys).toContain("Bash");
    expect(keys).toContain("Read");
  });

  it("extracts tool_name from interrupt signals", () => {
    const signals: SessionSignal[] = [
      makeSignal("interrupt", {
        tool_name: "Edit",
        error: "Failed to apply edit",
      }),
    ];
    const keys = extractRetrievalKeys(signals);
    expect(keys).toContain("Edit");
  });

  it("extracts keywords from post_interrupt_turn prompts", () => {
    const signals: SessionSignal[] = [
      makeSignal("post_interrupt_turn", {
        prompt: "No, that's wrong. The function should use TypeScript generics.",
      }),
    ];
    const keys = extractRetrievalKeys(signals);
    expect(keys).toContain("TypeScript");
  });

  it("extracts keywords from corrective_instruction prompts", () => {
    const signals: SessionSignal[] = [
      makeSignal("corrective_instruction", {
        prompt: "Try again with the database connection pooling approach.",
        pattern: "try_again",
        language: "en",
      }),
    ];
    const keys = extractRetrievalKeys(signals);
    expect(keys).toContain("database");
  });

  it("deduplicates keys", () => {
    const signals: SessionSignal[] = [
      makeSignal("tool_success", { tool_name: "Bash", is_test_runner: false }),
      makeSignal("tool_success", { tool_name: "Bash", is_test_runner: true }),
    ];
    const keys = extractRetrievalKeys(signals);
    const bashCount = keys.filter((k) => k === "Bash").length;
    expect(bashCount).toBe(1);
  });

  it("limits max number of keys", () => {
    const signals: SessionSignal[] = Array.from({ length: 50 }, (_, i) =>
      makeSignal("tool_success", {
        tool_name: `Tool${i}`,
        is_test_runner: false,
      })
    );
    const keys = extractRetrievalKeys(signals, 10);
    expect(keys.length).toBeLessThanOrEqual(10);
  });

  it("returns empty array for empty signals", () => {
    const keys = extractRetrievalKeys([]);
    expect(keys).toEqual([]);
  });

  it("handles signals with null data", () => {
    const signals: SessionSignal[] = [makeSignal("stop", null)];
    const keys = extractRetrievalKeys(signals);
    expect(keys).toEqual([]);
  });

  it("filters out common stop words from prompt keywords", () => {
    const signals: SessionSignal[] = [
      makeSignal("post_interrupt_turn", {
        prompt: "The function is not working correctly",
      }),
    ];
    const keys = extractRetrievalKeys(signals);
    expect(keys).not.toContain("the");
    expect(keys).not.toContain("is");
    expect(keys).not.toContain("not");
    expect(keys).toContain("function");
  });
});
