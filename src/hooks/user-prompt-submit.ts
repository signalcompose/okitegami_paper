/**
 * UserPromptSubmit hook — post-interrupt dialogue capture
 * Issue #38: feat(hooks): signal recording hooks
 */

import { bootstrapHook, requireInputString, runAsHookScript } from "./_common.js";

export async function handleUserPromptSubmit(stdin: string): Promise<void> {
  const ctx = await bootstrapHook(stdin);
  if (!ctx) return;

  try {
    const { input, collector } = ctx;
    const sessionId = requireInputString(input, "session_id", "UserPromptSubmit");
    const prompt = requireInputString(input, "prompt", "UserPromptSubmit");

    collector.handleUserPrompt(sessionId, prompt);
  } finally {
    ctx.cleanup();
  }
}

runAsHookScript(handleUserPromptSubmit, "user-prompt-submit");
