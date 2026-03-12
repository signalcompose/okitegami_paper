/**
 * SessionStart hook — retrieval and context injection
 * Issue #40: feat(hooks): session-start hook
 *
 * Retrieves relevant past experiences and outputs injection text to stdout.
 * The injection text is appended to the session context by Claude Code.
 */
import { bootstrapHook, requireInputString, runAsHookScript } from "./_common.js";
import { Retriever } from "../retrieval/retriever.js";
import { formatInjection } from "../retrieval/injector.js";
/**
 * Core logic: retrieve experiences, format injection text, and log injection event.
 * Separated from async Embedder initialization for testability.
 */
export function retrieveAndInject(ctx, queryEmbedding, sessionId, queryText) {
    const retriever = new Retriever(ctx.experienceStore);
    const results = retriever.retrieve(queryEmbedding, ctx.config.top_k);
    const injectionText = formatInjection(results);
    // Record injection log — best-effort, must not abort injection delivery
    if (results.length > 0) {
        try {
            ctx.signalStore.addSignal(sessionId, "injection", {
                injected_ids: results.map((r) => r.entry.id),
                injected_count: results.length,
                query_text: queryText,
                project: ctx.projectName,
            });
        }
        catch (err) {
            console.error(`[ACM] session-start: failed to record injection signal for session="${sessionId}": ` +
                `${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return injectionText;
}
/**
 * Full async handler: initializes Embedder, generates query embedding,
 * retrieves experiences, and writes injection text to stdout.
 */
export async function handleSessionStart(stdin) {
    const ctx = bootstrapHook(stdin);
    if (!ctx)
        return;
    try {
        const { Embedder } = await import("../retrieval/embedder.js");
        const embedder = new Embedder();
        try {
            await embedder.initialize();
            // Build query from session context
            const sessionId = requireInputString(ctx.input, "session_id", "SessionStart");
            const cwd = ctx.input.cwd ?? "";
            const queryText = `session ${sessionId} working in ${cwd}`;
            const queryEmbedding = await embedder.embed(queryText);
            const injectionText = retrieveAndInject(ctx, queryEmbedding, sessionId, queryText);
            if (injectionText) {
                process.stdout.write(injectionText);
            }
        }
        finally {
            embedder.dispose();
        }
    }
    finally {
        ctx.cleanup();
    }
}
runAsHookScript(handleSessionStart, "session-start");
//# sourceMappingURL=session-start.js.map