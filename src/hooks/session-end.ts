/**
 * SessionEnd hook — experience generation
 * Issue #39: feat(hooks): session-end hook
 *
 * Aggregates signals → generates experience entries → stores.
 * Embedding is deferred (requires async Embedder, handled separately).
 */

import { bootstrapHook, requireInputString, runAsHookScript } from "./_common.js";
import { ExperienceGenerator } from "../experience/generator.js";

export function handleSessionEnd(stdin: string): void {
  const ctx = bootstrapHook(stdin);
  if (!ctx) return;

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

    // Persist each entry with project name (without embedding — embedding requires async Embedder)
    for (const entryData of entries) {
      experienceStore.create({ ...entryData, project: ctx.projectName });
    }
  } finally {
    ctx.cleanup();
  }
}

runAsHookScript(handleSessionEnd, "session-end");
