/**
 * SessionEnd hook — experience generation with embedding
 * Issue #39: feat(hooks): session-end hook
 * Issue #76: fix: generate embedding at session-end
 *
 * Aggregates signals → generates experience entries → embeds → stores.
 */

import { bootstrapHook, requireInputString, runAsHookScript } from "./_common.js";
import { ExperienceGenerator } from "../experience/generator.js";
import { buildEmbeddingText } from "../retrieval/embedding-text.js";
import type { Embedder as EmbedderType } from "../retrieval/embedder.js";

export async function handleSessionEnd(stdin: string): Promise<void> {
  const ctx = await bootstrapHook(stdin);
  if (!ctx) return;

  let embedder: EmbedderType | null = null;
  try {
    const { input, config, signalStore, experienceStore, collector } = ctx;
    const sessionId = requireInputString(input, "session_id", "SessionEnd");

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
    const { Embedder } = await import("../retrieval/embedder.js");
    embedder = new Embedder();
    await embedder.initialize();

    // Persist each entry with embedding and project name
    for (const entryData of entries) {
      const text = buildEmbeddingText(entryData);
      const embedding = await embedder.embed(text);
      experienceStore.createWithEmbedding({ ...entryData, project: ctx.projectName }, embedding);
    }
  } finally {
    if (embedder) embedder.dispose();
    ctx.cleanup();
  }
}

runAsHookScript(handleSessionEnd, "session-end");
