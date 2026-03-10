/**
 * Stop hook — normal completion recording
 * Issue #38: feat(hooks): signal recording hooks
 */

import { bootstrapHook, requireInputString, runAsHookScript } from "./_common.js";

export function handleStop(stdin: string): void {
  const ctx = bootstrapHook(stdin);
  if (!ctx) return;

  try {
    const { input, collector } = ctx;
    const sessionId = requireInputString(input, "session_id", "Stop");
    collector.handleStop(sessionId);
  } finally {
    ctx.cleanup();
  }
}

runAsHookScript(handleStop, "stop");
