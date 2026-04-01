/**
 * Stop hook — normal completion recording
 * Issue #38: feat(hooks): signal recording hooks
 */

import { bootstrapHook, requireInputString, runAsHookScript } from "./_common.js";

export async function handleStop(stdin: string): Promise<void> {
  const ctx = await bootstrapHook(stdin);
  if (!ctx) return;

  try {
    const { input, collector } = ctx;
    if (input.stop_hook_active === true) return;
    const sessionId = requireInputString(input, "session_id", "Stop");
    const raw = input.last_assistant_message;
    const lastAssistantMessage = typeof raw === "string" && raw.length > 0 ? raw : undefined;
    collector.handleStop(sessionId, lastAssistantMessage);
  } finally {
    ctx.cleanup();
  }
}

runAsHookScript(handleStop, "stop");
