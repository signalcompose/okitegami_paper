import { describe, it, expect } from "vitest";
import { isAcmCondition } from "../types.js";

describe("isAcmCondition", () => {
  it("returns false for 'control'", () => {
    expect(isAcmCondition("control")).toBe(false);
  });

  it("returns false for 'baseline-compact'", () => {
    expect(isAcmCondition("baseline-compact")).toBe(false);
  });

  it("returns true for 'acm-s'", () => {
    expect(isAcmCondition("acm-s")).toBe(true);
  });

  it("returns true for 'acm-f'", () => {
    expect(isAcmCondition("acm-f")).toBe(true);
  });

  it("returns true for 'acm-sf'", () => {
    expect(isAcmCondition("acm-sf")).toBe(true);
  });

  it("returns true for unknown condition strings", () => {
    expect(isAcmCondition("some-future-condition")).toBe(true);
  });
});
