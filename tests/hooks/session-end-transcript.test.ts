/**
 * Integration tests for session-end transcript-based corrective detection
 * Issue #83: transcript-based corrective instruction detection
 *
 * Verifies the full flow: transcript JSONL → parseTranscript → classifyCorrections
 * → corrective_instruction signals → failure experience generation.
 */

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { rmSync } from "node:fs";
import { handleSessionEnd } from "../../src/hooks/session-end.js";
import { handlePostToolUse } from "../../src/hooks/post-tool-use.js";
import { handlePostToolUseFailure } from "../../src/hooks/post-tool-use-failure.js";
import { handleStop } from "../../src/hooks/stop.js";
import { bootstrapHook } from "../../src/hooks/_common.js";
import {
  userLine,
  interruptLine,
  assistantLine,
  setupEnv as setupEnvBase,
  writeTranscript as writeTranscriptBase,
  makeTmpDir,
} from "./_fixtures.js";

const TMP_DIR = makeTmpDir("session-end-transcript");
const setupEnv = (mode?: string) => setupEnvBase(TMP_DIR, mode);
const writeTranscript = (lines: string[]) => writeTranscriptBase(TMP_DIR, lines);

describe("session-end transcript-based corrective detection", () => {
  const originalEnv = process.env.ACM_CONFIG_PATH;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    process.env.ACM_CONFIG_PATH = originalEnv;
    vi.restoreAllMocks();
    try {
      rmSync(TMP_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("detects corrective instruction via structural fallback (interrupt + follow-up)", async () => {
    setupEnv();
    const sessionId = "transcript-s1";

    // Ollama unavailable → structural fallback
    mockFetch.mockRejectedValue(new Error("Connection refused"));

    // Create transcript with interrupt + corrective follow-up
    const transcriptPath = writeTranscript([
      userLine("Fix the authentication bug"),
      assistantLine("I'll modify auth.ts..."),
      interruptLine(),
      userLine("No, use a different approach"),
    ]);

    // Create some signals so session-end has something to generate from
    await handlePostToolUseFailure(
      JSON.stringify({
        session_id: sessionId,
        tool_name: "Bash",
        error: "command failed",
        is_interrupt: true,
      })
    );
    await handleStop(JSON.stringify({ session_id: sessionId }));

    // Run session-end with transcript_path
    await handleSessionEnd(
      JSON.stringify({ session_id: sessionId, transcript_path: transcriptPath })
    );

    // Verify corrective signals were recorded
    const ctx = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const signals = ctx!.signalStore.getBySession(sessionId);
    const correctiveSignals = signals.filter((s) => s.event_type === "corrective_instruction");
    expect(correctiveSignals.length).toBeGreaterThanOrEqual(1);

    // Verify the corrective signal has structural method
    const data = correctiveSignals[0].data as Record<string, unknown>;
    expect(data.method).toBe("structural");
    expect(data.confidence).toBe(0.4);

    ctx!.cleanup();
  });

  it("generates failure experience when transcript has corrective instructions", async () => {
    setupEnv();
    const sessionId = "transcript-s2";

    // Ollama unavailable → structural fallback
    mockFetch.mockRejectedValue(new Error("Connection refused"));

    const transcriptPath = writeTranscript([
      userLine("Implement the feature"),
      assistantLine("Working on it..."),
      interruptLine(),
      userLine("That's wrong, try again"),
    ]);

    // Need interrupt signal + stop for session-end to process
    await handlePostToolUseFailure(
      JSON.stringify({
        session_id: sessionId,
        tool_name: "Bash",
        error: "interrupted",
        is_interrupt: true,
      })
    );
    await handleStop(JSON.stringify({ session_id: sessionId }));

    await handleSessionEnd(
      JSON.stringify({ session_id: sessionId, transcript_path: transcriptPath })
    );

    // Verify failure experience was generated
    const ctx = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const entries = ctx!.experienceStore.list();
    const failure = entries.find((e) => e.type === "failure");
    expect(failure).toBeDefined();
    expect(failure!.signal_strength).toBeGreaterThan(0);
    ctx!.cleanup();
  });

  it("proceeds normally without transcript_path", async () => {
    setupEnv();
    const sessionId = "transcript-s3";

    // Tool success + stop (no transcript)
    await handlePostToolUse(
      JSON.stringify({
        session_id: sessionId,
        tool_name: "Bash",
        tool_input: { command: "echo ok" },
        result: "ok",
      })
    );
    await handleStop(JSON.stringify({ session_id: sessionId }));

    // No transcript_path → should still generate success experience
    await handleSessionEnd(JSON.stringify({ session_id: sessionId }));

    const ctx = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const entries = ctx!.experienceStore.list();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const success = entries.find((e) => e.type === "success");
    expect(success).toBeDefined();
    ctx!.cleanup();
  });

  it("continues experience generation even when transcript analysis throws", async () => {
    setupEnv();
    const sessionId = "transcript-s4";

    // Create an invalid transcript file (not valid JSONL)
    const transcriptPath = writeTranscript(["not valid json at all {{{!!!"]);

    await handlePostToolUse(
      JSON.stringify({
        session_id: sessionId,
        tool_name: "Bash",
        tool_input: { command: "echo ok" },
        result: "ok",
      })
    );
    await handleStop(JSON.stringify({ session_id: sessionId }));

    // Should not throw — transcript analysis errors are caught
    await handleSessionEnd(
      JSON.stringify({ session_id: sessionId, transcript_path: transcriptPath })
    );

    // Experience generation should still work
    const ctx = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const entries = ctx!.experienceStore.list();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    ctx!.cleanup();
  });

  it("skips transcript analysis for single-turn transcripts", async () => {
    setupEnv();
    const sessionId = "transcript-s5";

    // Ollama unavailable
    mockFetch.mockRejectedValue(new Error("Connection refused"));

    // Single-turn transcript (≤1 turn) — should skip classification
    const transcriptPath = writeTranscript([userLine("Just one message")]);

    await handlePostToolUse(
      JSON.stringify({
        session_id: sessionId,
        tool_name: "Bash",
        tool_input: { command: "echo ok" },
        result: "ok",
      })
    );
    await handleStop(JSON.stringify({ session_id: sessionId }));

    await handleSessionEnd(
      JSON.stringify({ session_id: sessionId, transcript_path: transcriptPath })
    );

    // No corrective signals should be recorded
    const ctx = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const signals = ctx!.signalStore.getBySession(sessionId);
    const correctiveSignals = signals.filter((s) => s.event_type === "corrective_instruction");
    expect(correctiveSignals).toHaveLength(0);
    ctx!.cleanup();
  });

  it("detects corrective instruction via Ollama LLM classification", async () => {
    setupEnv();
    const sessionId = "transcript-s6";

    // Mock Ollama available
    mockFetch.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlStr.includes("/api/tags")) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      if (urlStr.includes("/api/generate")) {
        // LLM classifies turn index 1 as corrective
        return new Response(
          JSON.stringify({
            response: JSON.stringify([
              { index: 1, corrective: true, confidence: 0.85, reason: "redirecting approach" },
            ]),
          }),
          { status: 200 }
        );
      }
      return new Response("Not found", { status: 404 });
    });

    const transcriptPath = writeTranscript([
      userLine("Build the login page"),
      userLine("No wait, use a different framework"),
    ]);

    // Need signals for session-end
    await handlePostToolUse(
      JSON.stringify({
        session_id: sessionId,
        tool_name: "Bash",
        tool_input: { command: "echo ok" },
        result: "ok",
      })
    );
    await handleStop(JSON.stringify({ session_id: sessionId }));

    await handleSessionEnd(
      JSON.stringify({ session_id: sessionId, transcript_path: transcriptPath })
    );

    // Verify corrective signal with LLM method
    const ctx = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const signals = ctx!.signalStore.getBySession(sessionId);
    const correctiveSignals = signals.filter((s) => s.event_type === "corrective_instruction");
    expect(correctiveSignals.length).toBeGreaterThanOrEqual(1);

    const data = correctiveSignals[0].data as Record<string, unknown>;
    expect(data.method).toBe("llm");
    expect(data.confidence).toBe(0.85);
    expect(data.reason).toBe("redirecting approach");

    ctx!.cleanup();
  });

  it("does not duplicate corrective signals when called twice (idempotency)", async () => {
    setupEnv();
    const sessionId = "transcript-dedup-1";

    mockFetch.mockRejectedValue(new Error("Connection refused"));

    const transcriptPath = writeTranscript([
      userLine("Fix the bug"),
      assistantLine("Working on it..."),
      interruptLine(),
      userLine("No, do it differently"),
    ]);

    await handlePostToolUseFailure(
      JSON.stringify({
        session_id: sessionId,
        tool_name: "Bash",
        error: "interrupted",
        is_interrupt: true,
      })
    );
    await handleStop(JSON.stringify({ session_id: sessionId }));

    // Call session-end TWICE with the same session_id
    await handleSessionEnd(
      JSON.stringify({ session_id: sessionId, transcript_path: transcriptPath })
    );
    await handleSessionEnd(
      JSON.stringify({ session_id: sessionId, transcript_path: transcriptPath })
    );

    // Verify corrective signals are NOT duplicated
    const ctx = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const signals = ctx!.signalStore.getBySession(sessionId);
    const correctiveSignals = signals.filter((s) => s.event_type === "corrective_instruction");
    expect(correctiveSignals).toHaveLength(1); // Not 2
    ctx!.cleanup();
  });

  it("does not duplicate experience entries when called twice (idempotency)", async () => {
    setupEnv();
    const sessionId = "transcript-dedup-2";

    mockFetch.mockRejectedValue(new Error("Connection refused"));

    const transcriptPath = writeTranscript([
      userLine("Implement the feature"),
      assistantLine("Sure..."),
      interruptLine(),
      userLine("That's wrong, try again"),
    ]);

    await handlePostToolUseFailure(
      JSON.stringify({
        session_id: sessionId,
        tool_name: "Bash",
        error: "interrupted",
        is_interrupt: true,
      })
    );
    await handleStop(JSON.stringify({ session_id: sessionId }));

    // Call session-end TWICE
    await handleSessionEnd(
      JSON.stringify({ session_id: sessionId, transcript_path: transcriptPath })
    );
    await handleSessionEnd(
      JSON.stringify({ session_id: sessionId, transcript_path: transcriptPath })
    );

    // Verify only ONE failure experience entry exists
    const ctx = await bootstrapHook(JSON.stringify({ session_id: sessionId }));
    const entries = ctx!.experienceStore.list();
    const failures = entries.filter((e) => e.type === "failure");
    expect(failures).toHaveLength(1); // Not 2
    ctx!.cleanup();
  });
});
