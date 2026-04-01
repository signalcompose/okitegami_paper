/**
 * PostToolUseFailure hook — interrupt detection
 * Issue #38: feat(hooks): signal recording hooks
 */

import { bootstrapHook, requireInputString, runAsHookScript } from "./_common.js";

export async function handlePostToolUseFailure(stdin: string): Promise<void> {
  const ctx = await bootstrapHook(stdin);
  if (!ctx) return;

  try {
    const { input, collector } = ctx;
    const sessionId = requireInputString(input, "session_id", "PostToolUseFailure");
    const isInterrupt = input.is_interrupt as boolean;
    const toolName = requireInputString(input, "tool_name", "PostToolUseFailure");
    const error = (input.error as string) ?? "";

    if (isInterrupt) {
      collector.handleInterrupt(sessionId, toolName, error);
    } else {
      collector.handleToolFailure(sessionId, toolName, error);
    }
  } finally {
    ctx.cleanup();
  }
}

runAsHookScript(handlePostToolUseFailure, "post-tool-use-failure");
