/**
 * Stop hook — normal completion recording
 * Issue #38: feat(hooks): signal recording hooks
 */

import { bootstrapHook, runAsHookScript } from "./_common.js";

export function handleStop(stdin: string): void {
  const ctx = bootstrapHook(stdin);
  if (!ctx) return;

  try {
    const { input, collector } = ctx;
    const sessionId = input.session_id as string;
    collector.handleStop(sessionId);
  } finally {
    ctx.cleanup();
  }
}

runAsHookScript(handleStop, "stop");
