/**
 * PostToolUseFailure hook — interrupt detection
 * Issue #38: feat(hooks): signal recording hooks
 */
import { bootstrapHook, requireInputString, runAsHookScript } from "./_common.js";
export async function handlePostToolUseFailure(stdin) {
    const ctx = await bootstrapHook(stdin);
    if (!ctx)
        return;
    try {
        const { input, collector } = ctx;
        const sessionId = requireInputString(input, "session_id", "PostToolUseFailure");
        const rawInterrupt = input.is_interrupt;
        if (typeof rawInterrupt !== "boolean") {
            throw new Error(`PostToolUseFailure: "is_interrupt" must be a boolean, got ${JSON.stringify(rawInterrupt)}`);
        }
        const isInterrupt = rawInterrupt;
        const toolName = requireInputString(input, "tool_name", "PostToolUseFailure");
        const error = input.error ?? "";
        if (isInterrupt) {
            collector.handleInterrupt(sessionId, toolName, error);
        }
        else {
            collector.handleToolFailure(sessionId, toolName, error);
        }
    }
    finally {
        ctx.cleanup();
    }
}
runAsHookScript(handlePostToolUseFailure, "post-tool-use-failure");
//# sourceMappingURL=post-tool-use-failure.js.map