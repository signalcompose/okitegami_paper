/**
 * SessionEnd hook — experience generation with embedding
 * Issue #39: feat(hooks): session-end hook
 * Issue #76: fix: generate embedding at session-end
 * Issue #83: transcript-based corrective instruction detection
 *
 * Parses transcript → classifies corrections → records signals →
 * aggregates → generates experience entries → embeds → stores.
 */

import { bootstrapHook, requireInputString, runAsHookScript } from "./_common.js";
import { ExperienceGenerator } from "../experience/generator.js";
import { buildEmbeddingText } from "../retrieval/embedding-text.js";
import { parseTranscript } from "../signals/transcript-parser.js";
import { classifyCorrections } from "../signals/corrective-classifier.js";
import type { Embedder as EmbedderType } from "../retrieval/embedder.js";

export async function handleSessionEnd(stdin: string): Promise<void> {
  const ctx = await bootstrapHook(stdin);
  if (!ctx) return;

  let embedder: EmbedderType | null = null;
  try {
    const { input, config, signalStore, experienceStore, collector } = ctx;
    const sessionId = requireInputString(input, "session_id", "SessionEnd");

    // --- Phase 1: Transcript-based corrective instruction detection ---
    // Idempotency guard: skip if corrective signals already exist for this session
    const existingSignals = signalStore.getBySession(sessionId);
    const hasCorrectiveSignals = existingSignals.some(
      (s) => s.event_type === "corrective_instruction"
    );

    if (!hasCorrectiveSignals) {
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
              signalStore.addSignal(sessionId, "corrective_instruction", {
                prompt: c.message.text.slice(0, 200),
                reason: c.reason,
                confidence: c.confidence,
                method: c.method,
              });
            }
          }
        } catch (err) {
          console.error(
            `[ACM] session-end: transcript analysis failed for "${transcriptPath}", ` +
              `continuing without corrective signals: ` +
              `${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    // --- Phase 2: Experience generation (existing flow) ---
    // Idempotency guard: skip if experience entries already exist for this session
    if (experienceStore.hasEntriesForSession(sessionId)) return;

    // Get session summary and signals
    const summary = collector.getSessionSummary(sessionId);
    if (summary.total_signals === 0) return;

    const signals = signalStore.getBySession(sessionId);

    // Generate experience entries
    const generator = new ExperienceGenerator({
      capture_turns: config.capture_turns,
      promotion_threshold: config.promotion_threshold,
    });
    const entries = generator.generate({ session_id: sessionId, summary, signals });

    if (entries.length === 0) return;

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
    }

    // Persist each entry with project name (and embedding if available)
    for (const entryData of entries) {
      if (embedderReady && embedder) {
        const text = buildEmbeddingText(entryData);
        const embedding = await embedder.embed(text);
        experienceStore.createWithEmbedding({ ...entryData, project: ctx.projectName }, embedding);
      } else {
        experienceStore.create({ ...entryData, project: ctx.projectName });
      }
    }
  } finally {
    if (embedder) embedder.dispose();
    ctx.cleanup();
  }
}

runAsHookScript(handleSessionEnd, "session-end");
