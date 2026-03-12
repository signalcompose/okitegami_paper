/**
 * PostToolUseFailure hook — interrupt detection
 * Issue #38: feat(hooks): signal recording hooks
 */
import { bootstrapHook, requireInputString, runAsHookScript } from "./_common.js";
export function handlePostToolUseFailure(stdin) {
    const ctx = bootstrapHook(stdin);
    if (!ctx)
        return;
    try {
        const { input, collector } = ctx;
        const sessionId = requireInputString(input, "session_id", "PostToolUseFailure");
        const isInterrupt = input.is_interrupt;
        if (!isInterrupt)
            return;
        const toolName = requireInputString(input, "tool_name", "PostToolUseFailure");
        collector.handleInterrupt(sessionId, toolName, input.error ?? "");
    }
    finally {
        ctx.cleanup();
    }
}
runAsHookScript(handlePostToolUseFailure, "post-tool-use-failure");
//# sourceMappingURL=post-tool-use-failure.js.map