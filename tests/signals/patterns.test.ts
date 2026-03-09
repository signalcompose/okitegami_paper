import { describe, it, expect } from "vitest";
import { detectCorrectiveInstruction } from "../../src/signals/patterns.js";

describe("detectCorrectiveInstruction", () => {
  describe("English patterns", () => {
    it.each([
      ["that's wrong", "that's wrong, it should be X"],
      ["try again", "try again with the correct path"],
      ["not what I meant", "that's not what I meant"],
      ["undo", "undo that change"],
      ["revert", "revert the last commit"],
      ["wrong approach", "wrong approach, use Y instead"],
      ["don't do that", "don't do that"],
      ["stop, that's", "stop, that's incorrect"],
      ["no no no", "no no no, I said to use X"],
      ["use X instead", "use map instead"],
    ])("detects '%s' pattern in: %s", (_pattern, input) => {
      const result = detectCorrectiveInstruction(input);
      expect(result).not.toBeNull();
      expect(result!.pattern).toBeTruthy();
    });
  });

  describe("Japanese patterns", () => {
    it.each([
      ["違う", "それは違う"],
      ["やり直し", "やり直して"],
      ["そうじゃない", "そうじゃない、こうして"],
      ["元に戻して", "元に戻してください"],
      ["取り消し", "取り消して"],
      ["間違", "間違ってる"],
      ["ダメ", "それはダメです"],
      ["やめて", "やめてください"],
    ])("detects '%s' pattern in: %s", (_pattern, input) => {
      const result = detectCorrectiveInstruction(input);
      expect(result).not.toBeNull();
    });
  });

  describe("false positives — should NOT detect", () => {
    it.each([
      "Please implement the login feature",
      "Add error handling to the function",
      "Looks good, thanks!",
      "Can you explain how this works?",
      "Read the README file",
      "Write a test for the parser",
      "テストを書いてください",
      "ログイン機能を実装して",
      "ありがとう、助かりました",
      "stop the loop when i exceeds n",
      "what went wrong?",
      "stop running after the first failure",
      "something is wrong with the API",
      "add a fallback instead",
    ])("does not detect corrective pattern in: %s", (input) => {
      const result = detectCorrectiveInstruction(input);
      expect(result).toBeNull();
    });
  });

  describe("return value", () => {
    it("returns matched pattern and language", () => {
      const result = detectCorrectiveInstruction("that's wrong, fix it");
      expect(result).toEqual(
        expect.objectContaining({
          pattern: expect.any(String),
          language: "en",
        })
      );
    });

    it("returns Japanese language for Japanese patterns", () => {
      const result = detectCorrectiveInstruction("それは違う");
      expect(result).toEqual(
        expect.objectContaining({
          language: "ja",
        })
      );
    });
  });
});
