/**
 * UserPromptSubmit hook — post-interrupt dialogue capture + corrective instruction detection
 * Issue #38: feat(hooks): signal recording hooks
 */

import { bootstrapHook, runAsHookScript } from "./_common.js";

export function handleUserPromptSubmit(stdin: string): void {
  const ctx = bootstrapHook(stdin);
  if (!ctx) return;

  try {
    const { input, collector } = ctx;
    const sessionId = input.session_id as string;
    const prompt = input.prompt as string;

    collector.handleUserPrompt(sessionId, prompt);
  } finally {
    ctx.cleanup();
  }
}

runAsHookScript(handleUserPromptSubmit, "user-prompt-submit");
