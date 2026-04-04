/**
 * Tests for CorrectiveClassifier — Ollama LLM classification + interrupt fallback
 * Issue #83: transcript-based corrective instruction detection
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ParsedTranscript, TranscriptTurn } from "../../src/signals/transcript-parser.js";
import { classifyCorrections, isOllamaAvailable } from "../../src/signals/corrective-classifier.js";

// --- Helpers ---

function makeTurn(text: string, index: number, isAfterInterrupt = false): TranscriptTurn {
  return {
    index,
    humanMessage: {
      text,
      timestamp: new Date().toISOString(),
      promptId: `prompt-${index}`,
      uuid: `uuid-${index}`,
    },
    isAfterInterrupt,
  };
}

function makeTranscript(turns: TranscriptTurn[], interruptCount = 0): ParsedTranscript {
  return {
    turns,
    interruptCount,
    totalHumanMessages: turns.length,
  };
}

// Mock fetch globally for Ollama API tests
const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CorrectiveClassifier", () => {
  describe("isOllamaAvailable", () => {
    it("returns true when Ollama responds", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      const result = await isOllamaAvailable("http://localhost:11434");
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11434/api/tags",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it("returns false when Ollama is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await isOllamaAvailable("http://localhost:11434");
      expect(result).toBe(false);
    });

    it("returns false when Ollama returns non-OK response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await isOllamaAvailable("http://localhost:11434");
      expect(result).toBe(false);
    });
  });

  describe("classifyCorrections — LLM mode", () => {
    it("classifies messages using Ollama LLM", async () => {
      // First call: isOllamaAvailable
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });
      // Second call: /api/generate — indices must match turn indices sent to LLM
      // Turn 0 is skipped (first message). Only turn 1 is sent.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: JSON.stringify([
            { index: 1, corrective: true, confidence: 0.85, reason: "redirecting approach" },
          ]),
        }),
      });

      const transcript = makeTranscript([
        makeTurn("Thanks, looks good", 0),
        makeTurn("Actually, let's try a different approach", 1),
      ]);

      const results = await classifyCorrections(transcript);

      expect(results).toHaveLength(1);
      expect(results[0].corrective).toBe(true);
      expect(results[0].method).toBe("llm");
      expect(results[0].message.text).toBe("Actually, let's try a different approach");
    });

    it("filters by minConfidence", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });
      // Turn 0 skipped, turns 1 and 2 sent to LLM
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: JSON.stringify([
            { index: 1, corrective: true, confidence: 0.3, reason: "low confidence" },
            { index: 2, corrective: true, confidence: 0.8, reason: "high confidence" },
          ]),
        }),
      });

      const transcript = makeTranscript([
        makeTurn("Initial request", 0),
        makeTurn("Maybe something else", 1),
        makeTurn("No, that's wrong", 2),
      ]);

      const results = await classifyCorrections(transcript, { minConfidence: 0.5 });
      expect(results).toHaveLength(1);
      expect(results[0].confidence).toBe(0.8);
    });

    it("skips first message (cannot be corrective)", async () => {
      // Single-turn transcript — classifyCorrections returns early (length <= 1)
      const transcript = makeTranscript([makeTurn("Only message in session", 0)]);

      const results = await classifyCorrections(transcript);
      expect(results).toHaveLength(0);
      // Ollama should not even be called
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sends correct prompt to Ollama", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: JSON.stringify([
            { index: 1, corrective: false, confidence: 0.9, reason: "normal" },
          ]),
        }),
      });

      const transcript = makeTranscript([
        makeTurn("First message", 0),
        makeTurn("Second message", 1),
      ]);

      await classifyCorrections(transcript, { model: "gemma2:2b" });

      // calls[0] = isOllamaAvailable (GET /api/tags)
      // calls[1] = classifyWithOllama (POST /api/generate)
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const generateCall = mockFetch.mock.calls[1];
      expect(generateCall[0]).toBe("http://localhost:11434/api/generate");
      const body = JSON.parse(generateCall[1].body as string);
      expect(body.model).toBe("gemma2:2b");
      expect(body.stream).toBe(false);
      expect(body.options.temperature).toBe(0);
      expect(body.prompt).toContain("Second message");
      expect(body.prompt).not.toContain("First message");
    });
  });

  describe("classifyCorrections — fallback mode (Ollama unavailable)", () => {
    it("falls back to structural detection when Ollama is unavailable", async () => {
      mockFetch.mockRejectedValue(new Error("Connection refused"));

      const transcript = makeTranscript(
        [
          makeTurn("Do the task", 0),
          makeTurn("No, do it differently", 1, true), // after interrupt
          makeTurn("And also add tests", 2),
        ],
        1
      );

      const results = await classifyCorrections(transcript);

      expect(results).toHaveLength(1);
      expect(results[0].corrective).toBe(true);
      expect(results[0].method).toBe("structural");
      expect(results[0].confidence).toBe(0.9);
      expect(results[0].message.text).toBe("No, do it differently");
    });

    it("returns empty when no interrupts and Ollama unavailable", async () => {
      mockFetch.mockRejectedValue(new Error("Connection refused"));

      const transcript = makeTranscript([makeTurn("Do task A", 0), makeTurn("Now do task B", 1)]);

      const results = await classifyCorrections(transcript);
      expect(results).toHaveLength(0);
    });

    it("falls back when Ollama returns invalid JSON", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: "This is not valid JSON at all",
        }),
      });

      const transcript = makeTranscript(
        [makeTurn("Start", 0), makeTurn("Changed my mind", 1, true)],
        1
      );

      const results = await classifyCorrections(transcript);
      // Should fall back to structural
      expect(results).toHaveLength(1);
      expect(results[0].method).toBe("structural");
    });

    it("falls back when Ollama generate call fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const transcript = makeTranscript([makeTurn("Start", 0), makeTurn("Stop that", 1, true)], 1);

      const results = await classifyCorrections(transcript);
      expect(results).toHaveLength(1);
      expect(results[0].method).toBe("structural");
    });
  });

  describe("classifyCorrections — empty/edge cases", () => {
    it("returns empty for empty transcript", async () => {
      const transcript = makeTranscript([]);
      const results = await classifyCorrections(transcript);
      expect(results).toHaveLength(0);
    });

    it("returns empty for single-turn transcript", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      const transcript = makeTranscript([makeTurn("Only message", 0)]);
      const results = await classifyCorrections(transcript);
      expect(results).toHaveLength(0);
    });
  });
});
