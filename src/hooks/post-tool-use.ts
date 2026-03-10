/**
 * PostToolUse hook — tool success recording
 * Issue #38: feat(hooks): signal recording hooks
 */

import { bootstrapHook, runAsHookScript } from "./_common.js";

export function handlePostToolUse(stdin: string): void {
  const ctx = bootstrapHook(stdin);
  if (!ctx) return;

  try {
    const { input, collector } = ctx;
    const sessionId = input.session_id as string;
    const toolName = input.tool_name as string;
    const toolInput = (input.tool_input as Record<string, unknown>) ?? {};
    const exitCode = typeof input.exit_code === "number" ? input.exit_code : undefined;

    collector.handleToolSuccess(sessionId, toolName, toolInput, exitCode);
  } finally {
    ctx.cleanup();
  }
}

runAsHookScript(handlePostToolUse, "post-tool-use");
