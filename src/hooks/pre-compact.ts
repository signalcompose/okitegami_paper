/**
 * PreCompact hook — corrective signal preservation before compaction
 * Issue #90: feat: migrate to SessionEnd + PreCompact hook pair
 *
 * Runs before context compaction to analyze the current transcript and
 * preserve corrective signals that would otherwise be lost when the
 * transcript is truncated. PreCompact cannot block compaction; it runs
 * before compaction begins. Best-effort preservation.
 */

import { bootstrapHook, requireInputString, runAsHookScript } from "./_common.js";
import { parseTranscript } from "../signals/transcript-parser.js";
import { classifyCorrections } from "../signals/corrective-classifier.js";

export async function handlePreCompact(stdin: string): Promise<void> {
  const ctx = await bootstrapHook(stdin);
  if (!ctx) return;

  let sessionId: string | undefined;
  try {
    const { input, config, signalStore } = ctx;
    sessionId = requireInputString(input, "session_id", "PreCompact");

    // Skip if corrective signals already exist for this session
    if (signalStore.hasSignalOfType(sessionId, "corrective_instruction")) {
      ctx.logger.log("skip", "pre_compact_skipped", {
        session_id: sessionId,
        reason: "corrective_signals_already_exist",
      });
      return;
    }

    const transcriptPath = input.transcript_path;
    if (typeof transcriptPath !== "string" || !transcriptPath) {
      ctx.logger.log("skip", "pre_compact_skipped", {
        session_id: sessionId,
        reason: "no_transcript_path",
      });
      return;
    }

    const parsed = parseTranscript(transcriptPath);
    if (parsed.turns.length <= 1) {
      ctx.logger.log("skip", "pre_compact_skipped", {
        session_id: sessionId,
        reason: "single_turn_transcript",
      });
      return;
    }

    let corrections;
    try {
      corrections = await classifyCorrections(parsed, {
        ollamaUrl: config.ollama_url,
        model: config.ollama_model,
      });
    } catch (err) {
      console.error(
        `[ACM] pre-compact: transcript classification failed for "${transcriptPath}": ` +
          `${err instanceof Error ? err.message : String(err)}`
      );
      ctx.logger.log("error", "pre_compact_classification_failed", {
        session_id: sessionId,
        transcript_path: transcriptPath,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      return;
    }

    const storedCorrections: typeof corrections = [];
    for (const c of corrections) {
      try {
        signalStore.addSignal(sessionId, "corrective_instruction", {
          prompt: c.message.text.slice(0, 200),
          reason: c.reason,
          confidence: c.confidence,
          method: c.method,
          source: "pre_compact",
        });
        storedCorrections.push(c);
      } catch (storeErr) {
        console.error(
          `[ACM] pre-compact: failed to store corrective signal for session "${sessionId}": ` +
            `${storeErr instanceof Error ? storeErr.message : String(storeErr)}`
        );
        ctx.logger.log("error", "pre_compact_signal_store_failed", {
          session_id: sessionId,
          error: storeErr instanceof Error ? storeErr.message : String(storeErr),
        });
      }
    }

    if (storedCorrections.length < corrections.length) {
      console.error(
        `[ACM] pre-compact: ${corrections.length - storedCorrections.length} of ${corrections.length} signal(s) failed to store for session "${sessionId}"`
      );
    }

    if (storedCorrections.length > 0) {
      ctx.logger.log("detection", "pre_compact_signals_preserved", {
        session_id: sessionId,
        corrective_count: storedCorrections.length,
        methods: storedCorrections.map((c) => c.method),
      });
      console.error(
        `[ACM] pre-compact: preserved ${storedCorrections.length} corrective signal(s) for session "${sessionId}"`
      );
    }
  } finally {
    try {
      ctx.cleanup();
    } catch (cleanupErr) {
      console.error(
        `[ACM] pre-compact: DB close/persist failed for session "${sessionId ?? "unknown"}": ` +
          `${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`
      );
    }
  }
}

runAsHookScript(handlePreCompact, "pre-compact");
