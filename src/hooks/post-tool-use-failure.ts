/**
 * PostToolUseFailure hook — interrupt detection
 * Issue #38: feat(hooks): signal recording hooks
 */

import { bootstrapHook, runAsHookScript } from "./_common.js";

export function handlePostToolUseFailure(stdin: string): void {
  const ctx = bootstrapHook(stdin);
  if (!ctx) return;

  try {
    const { input, collector } = ctx;
    const sessionId = input.session_id as string;
    const isInterrupt = input.is_interrupt as boolean;

    if (!isInterrupt) return;

    collector.handleInterrupt(sessionId, input.tool_name as string, input.error as string);
  } finally {
    ctx.cleanup();
  }
}

runAsHookScript(handlePostToolUseFailure, "post-tool-use-failure");
