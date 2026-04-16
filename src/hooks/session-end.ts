/**
 * SessionEnd hook — experience generation with embedding
 * Issue #39: feat(hooks): session-end hook
 * Issue #76: fix: generate embedding at session-end
 * Issue #83: transcript-based corrective instruction detection
 * Issue #90: migrate from Stop to SessionEnd event (fires once per session)
 *
 * Parses transcript → classifies corrections → records signals →
 * aggregates → generates experience entries → embeds → stores.
 *
 * SessionEnd fires exactly once per session, so idempotency guards are
 * retained only as safety nets (e.g., PreCompact may have already stored
 * corrective signals for this session).
 */

import { bootstrapHook, requireInputString, runAsHookScript } from "./_common.js";
import { ExperienceGenerator } from "../experience/generator.js";
import { buildEmbeddingText } from "../retrieval/embedding-text.js";
import { parseTranscript } from "../signals/transcript-parser.js";
import { classifyCorrections } from "../signals/corrective-classifier.js";
import { formatSessionEndMessage, type SessionEndSummary } from "./verbosity-formatter.js";
import type { Embedder as EmbedderType } from "../retrieval/embedder.js";
import type { Verbosity } from "../store/types.js";

function emitSummary(
  correctiveDetails: NonNullable<SessionEndSummary["corrective_details"]>,
  entriesGenerated: number,
  entriesPersisted: number,
  verbosity: Verbosity
): void {
  const systemMsg = formatSessionEndMessage(
    {
      corrective_count: correctiveDetails.length,
      entries_generated: entriesGenerated,
      entries_persisted: entriesPersisted,
      corrective_details: correctiveDetails.length > 0 ? correctiveDetails : undefined,
    },
    verbosity
  );
  if (systemMsg) {
    console.error(systemMsg);
  }
}

export async function handleSessionEnd(stdin: string): Promise<void> {
  const ctx = await bootstrapHook(stdin);
  if (!ctx) return;

  let embedder: EmbedderType | null = null;
  let sessionId: string | undefined;
  try {
    const { input, config, signalStore, experienceStore, collector } = ctx;
    sessionId = requireInputString(input, "session_id", "SessionEnd");
    const correctiveDetails: NonNullable<SessionEndSummary["corrective_details"]> = [];

    // --- Phase 1: Transcript-based corrective instruction detection ---
    let transcriptAnalysisSkipped = false;
    if (signalStore.hasSignalOfType(sessionId, "corrective_instruction")) {
      console.error(
        `[ACM] session-end: corrective signals already exist for "${sessionId}", skipping transcript analysis`
      );
      transcriptAnalysisSkipped = true;
      ctx.logger.log("skip", "transcript_analysis_skipped", {
        session_id: sessionId,
        reason: "corrective_signals_already_exist",
      });
    } else {
      const transcriptPath = input.transcript_path;
      if (typeof transcriptPath === "string" && transcriptPath) {
        try {
          const parsed = parseTranscript(transcriptPath);
          if (parsed.turns.length > 1) {
            const corrections = await classifyCorrections(parsed, {
              ollamaUrl: config.ollama_url,
              model: config.ollama_model,
            });
            for (const c of corrections) {
              const prompt = c.message.text.slice(0, 200);
              try {
                signalStore.addSignal(sessionId, "corrective_instruction", {
                  prompt,
                  reason: c.reason,
                  confidence: c.confidence,
                  method: c.method,
                });
                correctiveDetails.push({
                  prompt,
                  method: c.method,
                  confidence: c.confidence,
                });
              } catch (storeErr) {
                console.error(
                  `[ACM] session-end: failed to store corrective signal for session "${sessionId}": ` +
                    `${storeErr instanceof Error ? storeErr.message : String(storeErr)}`
                );
                ctx.logger.log("error", "corrective_signal_store_failed", {
                  session_id: sessionId,
                  error: storeErr instanceof Error ? storeErr.message : String(storeErr),
                });
              }
            }
            if (correctiveDetails.length > 0) {
              ctx.logger.log("detection", "correctives_detected", {
                session_id: sessionId,
                detected: corrections.length,
                stored: correctiveDetails.length,
                methods: correctiveDetails.map((c) => c.method),
                confidences: correctiveDetails.map((c) => c.confidence),
              });
            }
          }
        } catch (err) {
          console.error(
            `[ACM] session-end: transcript analysis failed for "${transcriptPath}", ` +
              `continuing without corrective signals: ` +
              `${err instanceof Error ? err.message : String(err)}`
          );
          ctx.logger.log("error", "transcript_analysis_failed", {
            session_id: sessionId,
            transcript_path: transcriptPath,
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          });
        }
      }
    }

    // --- Phase 1b: Build corrective summary from signal store ---
    // When transcript analysis was skipped because PreCompact already stored
    // corrective signals for this session, populate correctiveDetails from
    // the stored signals for the summary output.
    if (transcriptAnalysisSkipped && correctiveDetails.length === 0) {
      try {
        const storedSignals = signalStore.getBySession(sessionId);
        for (const sig of storedSignals) {
          if (sig.event_type === "corrective_instruction") {
            const data =
              sig.data != null && typeof sig.data === "object"
                ? (sig.data as Record<string, unknown>)
                : {};
            correctiveDetails.push({
              prompt: typeof data.prompt === "string" ? data.prompt : "",
              method: typeof data.method === "string" ? data.method : "unknown",
              confidence: typeof data.confidence === "number" ? data.confidence : undefined,
            });
          }
        }
      } catch (err) {
        console.error(
          `[ACM] session-end: failed reading stored corrective signals for "${sessionId}": ` +
            `${err instanceof Error ? err.message : String(err)}`
        );
        ctx.logger.log("error", "stored_signals_read_failed", {
          session_id: sessionId,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
      }
    }

    // --- Phase 2: Experience generation (segment-aware) ---
    // Session Segment Boundary (#115): use only signals recorded after the
    // last evaluation to support `claude -c` session continuation.
    const lastEval = experienceStore.getLastEvaluatedAt(sessionId);

    // Get segment-scoped session summary and signals
    const summary = lastEval
      ? collector.getSessionSummary(sessionId, { after: lastEval })
      : collector.getSessionSummary(sessionId);

    if (summary.total_signals === 0) {
      // No new signals since last evaluation — don't advance marker so
      // next SessionEnd can retry if signals arrive later.
      ctx.logger.log("skip", "no_signals_recorded", {
        session_id: sessionId,
        last_evaluated_at: lastEval,
      });
      emitSummary(correctiveDetails, 0, 0, config.verbosity);
      return;
    }

    const signals = lastEval
      ? signalStore.getBySessionAfter(sessionId, lastEval)
      : signalStore.getBySession(sessionId);

    // Generate experience entries
    const generator = new ExperienceGenerator({
      capture_turns: config.capture_turns,
      promotion_threshold: config.promotion_threshold,
    });
    const entries = generator.generate({ session_id: sessionId, summary, signals });

    // Record evaluation even if no entries generated (e.g. ambiguous segment).
    // This advances the segment boundary so the same signals aren't re-evaluated.
    experienceStore.recordEvaluation(sessionId, entries.length);

    if (entries.length === 0) {
      ctx.logger.log("skip", "no_entries_generated", {
        session_id: sessionId,
        last_evaluated_at: lastEval,
      });
      emitSummary(correctiveDetails, 0, 0, config.verbosity);
      return;
    }

    // Dynamic import to avoid loading @xenova/transformers WASM at module level
    // Fallback: if Embedder fails, store entries without embedding so they can be
    // backfilled later via acm_store_embedding. This preserves experience data
    // even when the ML model is unavailable (e.g. first-run model download timeout).
    let embedderReady = false;
    try {
      const { Embedder } = await import("../retrieval/embedder.js");
      embedder = new Embedder();
      await embedder.initialize();
      embedderReady = true;
    } catch (err) {
      console.error(
        `[ACM] session-end: Embedder initialization failed, storing entries without embedding: ` +
          `${err instanceof Error ? err.message : String(err)}`
      );
      ctx.logger.log("error", "embedder_init_failed", {
        session_id: sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Persist each entry with project name (and embedding if available)
    let persisted = 0;
    for (const entryData of entries) {
      try {
        let saved;
        if (embedderReady && embedder) {
          const text = buildEmbeddingText(entryData);
          const embedding = await embedder.embed(text);
          saved = experienceStore.createWithEmbedding(
            { ...entryData, project: ctx.projectName },
            embedding
          );
        } else {
          saved = experienceStore.create({ ...entryData, project: ctx.projectName });
        }
        if (saved) persisted++;
      } catch (entryErr) {
        console.error(
          `[ACM] session-end: failed to persist entry (type="${entryData.type}") ` +
            `for session "${sessionId}": ` +
            `${entryErr instanceof Error ? entryErr.message : String(entryErr)}`
        );
        ctx.logger.log("error", "experience_entry_persist_failed", {
          session_id: sessionId,
          entry_type: entryData.type,
          error: entryErr instanceof Error ? entryErr.message : String(entryErr),
        });
      }
    }

    if (persisted < entries.length) {
      console.error(
        `[ACM] session-end: ${entries.length - persisted} of ${entries.length} ` +
          `experience entries failed to persist for session "${sessionId}"`
      );
    }

    ctx.logger.log("generation", "experiences_created", {
      session_id: sessionId,
      generated: entries.length,
      persisted,
      types: entries.map((e) => e.type),
      embedded: embedderReady,
    });

    // --- Phase 3: Feedback Loop (SPECIFICATION 4.4.3) ---
    try {
      const injectionSignal = signals.find((s) => s.event_type === "injection");
      if (injectionSignal && injectionSignal.data) {
        const injData = injectionSignal.data as Record<string, unknown>;
        const injectedIds = injData.injected_ids;
        if (Array.isArray(injectedIds) && injectedIds.length > 0) {
          const hadCorrective = correctiveDetails.length > 0;
          const delta = hadCorrective ? -1 : 1;
          let adjusted = 0;
          for (const id of injectedIds) {
            if (typeof id === "string") {
              try {
                experienceStore.adjustFeedbackScore(id, delta);
                adjusted++;
              } catch (err) {
                console.warn(
                  `[ACM] feedback loop: adjustFeedbackScore failed for id="${id}": ` +
                    `${err instanceof Error ? err.message : String(err)}`
                );
              }
            }
          }
          if (adjusted > 0) {
            ctx.logger.log("generation", "feedback_adjusted", {
              session_id: sessionId,
              delta,
              adjusted_count: adjusted,
              had_corrective: hadCorrective,
            });
          }
        }
      }
    } catch (err) {
      console.error(
        `[ACM] session-end: feedback loop failed for session "${sessionId}": ` +
          `${err instanceof Error ? err.message : String(err)}`
      );
      ctx.logger.log("error", "feedback_loop_failed", {
        session_id: sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    emitSummary(correctiveDetails, entries.length, persisted, config.verbosity);
  } finally {
    if (embedder) embedder.dispose();
    try {
      ctx.cleanup();
    } catch (cleanupErr) {
      console.error(
        `[ACM] session-end: DB close/persist failed for session "${sessionId ?? "unknown"}": ` +
          `${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`
      );
    }
  }
}

runAsHookScript(handleSessionEnd, "session-end");
