/**
 * Stop hook — normal completion recording
 * Issue #38: feat(hooks): signal recording hooks
 */
import { bootstrapHook, requireInputString, runAsHookScript } from "./_common.js";
export async function handleStop(stdin) {
    const ctx = await bootstrapHook(stdin);
    if (!ctx)
        return;
    try {
        const { input, collector } = ctx;
        const sessionId = requireInputString(input, "session_id", "Stop");
        const lastAssistantMessage = input.last_assistant_message;
        collector.handleStop(sessionId, typeof lastAssistantMessage === "string" ? lastAssistantMessage : undefined);
    }
    finally {
        ctx.cleanup();
    }
}
runAsHookScript(handleStop, "stop");
//# sourceMappingURL=stop.js.map