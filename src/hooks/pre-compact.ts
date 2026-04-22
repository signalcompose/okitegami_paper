/**
 * PreCompact hook — corrective signal preservation + experience entry generation
 * Issue #90: feat: migrate to SessionEnd + PreCompact hook pair (Phase 1)
 * Issue #134: feat: promote corrective signals to experience entries at PreCompact (Phase 2)
 *
 * Phase 1: analyze transcript to preserve corrective signals before compaction.
 * Phase 2: generate experience entries from signals since the last segment boundary
 *          so long-running sessions get surfaced in retrieval without waiting for SessionEnd.
 *
 * Phase 2 reuses the session_evaluations table (#115) so SessionEnd won't re-process
 * the same signals. Phase 2 logic intentionally mirrors session-end.ts; a future
 * refactor may factor this out into a shared pipeline module.
 */

import { bootstrapHook, requireInputString, runAsHookScript, type HookContext } from "./_common.js";
import { parseTranscript } from "../signals/transcript-parser.js";
import { classifyCorrections } from "../signals/corrective-classifier.js";
import { ExperienceGenerator } from "../experience/generator.js";
import { buildEmbeddingText } from "../retrieval/embedding-text.js";
import type { Embedder as EmbedderType } from "../retrieval/embedder.js";

async function runPhase1(ctx: HookContext, sessionId: string): Promise<void> {
  const { input, config, signalStore } = ctx;

  // DB / FS reads are wrapped so storage or file-format errors in Phase 1
  // don't crash the hook before Phase 2 can run on prior signals.
  let alreadyHasSignals: boolean;
  try {
    alreadyHasSignals = signalStore.hasSignalOfType(sessionId, "corrective_instruction");
  } catch (err) {
    ctx.logger.log("error", "pre_compact_signal_check_failed", {
      session_id: sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (alreadyHasSignals) {
    ctx.logger.log("skip", "pre_compact_phase1_skipped", {
      session_id: sessionId,
      reason: "corrective_signals_already_exist",
    });
    return;
  }

  const transcriptPath = input.transcript_path;
  if (typeof transcriptPath !== "string" || !transcriptPath) {
    ctx.logger.log("skip", "pre_compact_phase1_skipped", {
      session_id: sessionId,
      reason: "no_transcript_path",
    });
    return;
  }

  let parsed;
  try {
    parsed = parseTranscript(transcriptPath);
  } catch (err) {
    console.error(
      `[ACM] pre-compact: parseTranscript failed for "${transcriptPath}": ` +
        `${err instanceof Error ? err.message : String(err)}`
    );
    ctx.logger.log("error", "pre_compact_transcript_parse_failed", {
      session_id: sessionId,
      transcript_path: transcriptPath,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (parsed.turns.length <= 1) {
    ctx.logger.log("skip", "pre_compact_phase1_skipped", {
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
}

async function runPhase2(ctx: HookContext, sessionId: string): Promise<void> {
  const { config, signalStore, experienceStore, collector, projectName, logger } = ctx;

  const lastEval = experienceStore.getLastEvaluatedAt(sessionId);
  const summary = collector.getSessionSummary(
    sessionId,
    lastEval ? { after: lastEval } : undefined
  );

  if (summary.total_signals === 0) {
    logger.log("skip", "pre_compact_phase2_no_signals", {
      session_id: sessionId,
      last_evaluated_at: lastEval,
    });
    return;
  }

  const signals = signalStore.getBySession(sessionId, lastEval ?? undefined);

  const generator = new ExperienceGenerator({
    capture_turns: config.capture_turns,
    promotion_threshold: config.promotion_threshold,
  });
  const entries = generator.generate({ session_id: sessionId, summary, signals });

  if (entries.length === 0) {
    experienceStore.recordEvaluation(sessionId, 0);
    logger.log("skip", "pre_compact_phase2_no_entries", {
      session_id: sessionId,
      last_evaluated_at: lastEval,
    });
    return;
  }

  let embedder: EmbedderType | undefined;
  let embedderReady = false;
  try {
    const { Embedder } = await import("../retrieval/embedder.js");
    embedder = new Embedder();
    await embedder.initialize();
    embedderReady = true;
  } catch (err) {
    console.error(
      `[ACM] pre-compact: Embedder initialization failed, storing entries without embedding: ` +
        `${err instanceof Error ? err.message : String(err)}`
    );
    logger.log("error", "pre_compact_embedder_init_failed", {
      session_id: sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  let persisted = 0;
  let embeddedCount = 0;
  try {
    for (const entryData of entries) {
      try {
        let saved;
        if (embedderReady && embedder) {
          const text = buildEmbeddingText(entryData);
          const embedding = await embedder.embed(text);
          saved = experienceStore.createWithEmbedding(
            { ...entryData, project: projectName },
            embedding
          );
          if (saved) embeddedCount++;
        } else {
          saved = experienceStore.create({ ...entryData, project: projectName });
        }
        if (saved) persisted++;
      } catch (entryErr) {
        // On embed failure: disable embedder for subsequent entries AND retry
        // this entry with embedding-less persist so it isn't silently dropped.
        if (embedderReady) {
          embedderReady = false;
          try {
            const retrySaved = experienceStore.create({ ...entryData, project: projectName });
            if (retrySaved) {
              persisted++;
              logger.log("generation", "pre_compact_entry_embedding_less_retry", {
                session_id: sessionId,
                entry_type: entryData.type,
                initial_error: entryErr instanceof Error ? entryErr.message : String(entryErr),
              });
              continue;
            }
          } catch (retryErr) {
            console.error(
              `[ACM] pre-compact: embedding-less retry also failed for entry (type="${entryData.type}") ` +
                `in session "${sessionId}": ` +
                `${retryErr instanceof Error ? retryErr.message : String(retryErr)}`
            );
            logger.log("error", "pre_compact_entry_retry_failed", {
              session_id: sessionId,
              entry_type: entryData.type,
              initial_error: entryErr instanceof Error ? entryErr.message : String(entryErr),
              retry_error: retryErr instanceof Error ? retryErr.message : String(retryErr),
            });
          }
        }
        console.error(
          `[ACM] pre-compact: failed to persist entry (type="${entryData.type}") ` +
            `for session "${sessionId}": ` +
            `${entryErr instanceof Error ? entryErr.message : String(entryErr)}`
        );
        logger.log("error", "pre_compact_entry_persist_failed", {
          session_id: sessionId,
          entry_type: entryData.type,
          error: entryErr instanceof Error ? entryErr.message : String(entryErr),
        });
      }
    }
  } finally {
    if (embedder) embedder.dispose();
  }

  if (persisted < entries.length) {
    console.error(
      `[ACM] pre-compact: ${entries.length - persisted} of ${entries.length} ` +
        `experience entries failed to persist for session "${sessionId}"`
    );
  }

  // Leaving the segment boundary un-advanced lets the next SessionEnd / PreCompact
  // invocation re-process the same signals (idempotent recovery). Applies only when
  // EVERY entry failed; partial success still advances, so individual failed entries
  // are dropped rather than duplicated on retry.
  if (persisted === 0 && entries.length > 0) {
    logger.log("error", "pre_compact_all_entries_failed_no_boundary_advance", {
      session_id: sessionId,
      entries_attempted: entries.length,
    });
    return;
  }

  let boundaryAdvanced = true;
  try {
    experienceStore.recordEvaluation(sessionId, persisted);
  } catch (err) {
    boundaryAdvanced = false;
    console.error(
      `[ACM] pre-compact: boundary advance failed for session "${sessionId}", ` +
        `${persisted} entries may duplicate on next invocation: ` +
        `${err instanceof Error ? err.message : String(err)}`
    );
    logger.log("error", "pre_compact_record_evaluation_failed", {
      session_id: sessionId,
      persisted,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  logger.log("generation", "pre_compact_experiences_created", {
    session_id: sessionId,
    generated: entries.length,
    persisted,
    embedded_count: embeddedCount,
    types: entries.map((e) => e.type),
    boundary_advanced: boundaryAdvanced,
  });
}

export async function handlePreCompact(stdin: string): Promise<void> {
  const ctx = await bootstrapHook(stdin);
  if (!ctx) return;

  let sessionId: string | undefined;
  try {
    sessionId = requireInputString(ctx.input, "session_id", "PreCompact");
    await runPhase1(ctx, sessionId);
    await runPhase2(ctx, sessionId);
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
