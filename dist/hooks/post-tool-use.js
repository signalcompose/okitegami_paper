/**
 * PostToolUse hook — tool success recording
 * Issue #38: feat(hooks): signal recording hooks
 */
import { bootstrapHook, requireInputString, runAsHookScript } from "./_common.js";
export async function handlePostToolUse(stdin) {
    const ctx = await bootstrapHook(stdin);
    if (!ctx)
        return;
    try {
        const { input, collector } = ctx;
        const sessionId = requireInputString(input, "session_id", "PostToolUse");
        const toolName = requireInputString(input, "tool_name", "PostToolUse");
        const toolInput = input.tool_input ?? {};
        const exitCode = typeof input.exit_code === "number" ? input.exit_code : undefined;
        collector.handleToolSuccess(sessionId, toolName, toolInput, exitCode);
    }
    finally {
        ctx.cleanup();
    }
}
runAsHookScript(handlePostToolUse, "post-tool-use");
//# sourceMappingURL=post-tool-use.js.map