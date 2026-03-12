/**
 * UserPromptSubmit hook — post-interrupt dialogue capture + corrective instruction detection
 * Issue #38: feat(hooks): signal recording hooks
 */
import { bootstrapHook, requireInputString, runAsHookScript } from "./_common.js";
export function handleUserPromptSubmit(stdin) {
    const ctx = bootstrapHook(stdin);
    if (!ctx)
        return;
    try {
        const { input, collector } = ctx;
        const sessionId = requireInputString(input, "session_id", "UserPromptSubmit");
        const prompt = requireInputString(input, "prompt", "UserPromptSubmit");
        collector.handleUserPrompt(sessionId, prompt);
    }
    finally {
        ctx.cleanup();
    }
}
runAsHookScript(handleUserPromptSubmit, "user-prompt-submit");
//# sourceMappingURL=user-prompt-submit.js.map