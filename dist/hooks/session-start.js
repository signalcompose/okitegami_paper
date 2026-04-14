/**
 * SessionStart hook — retrieval and context injection
 * Issue #40: feat(hooks): session-start hook
 * Issue #77: fix: use transcript-based query for semantic retrieval
 *
 * Retrieves relevant past experiences and outputs injection text to stdout.
 * The injection text is appended to the session context by Claude Code.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { bootstrapHook, requireInputString, runAsHookScript } from "./_common.js";
import { Retriever } from "../retrieval/retriever.js";
import { formatInjection } from "../retrieval/injector.js";
import { formatInjectionMessage } from "./verbosity-formatter.js";
const QUERY_MAX_LENGTH = 200;
/**
 * Extract the first user message text from a Claude Code transcript JSONL file.
 * Returns undefined if file is unreadable or contains no user message.
 */
function extractFirstUserMessage(transcriptPath) {
    try {
        const content = readFileSync(transcriptPath, "utf-8");
        for (const line of content.split("\n")) {
            if (!line.trim())
                continue;
            try {
                const entry = JSON.parse(line);
                if (entry.type !== "user")
                    continue;
                const message = entry.message;
                if (!message)
                    continue;
                const msgContent = message.content;
                if (typeof msgContent === "string")
                    return msgContent;
                if (Array.isArray(msgContent)) {
                    for (const item of msgContent) {
                        if (item?.type === "text" && typeof item.text === "string") {
                            return item.text;
                        }
                    }
                }
            }
            catch {
                // Skip malformed JSON lines
            }
        }
    }
    catch {
        // File unreadable — fall through
    }
    return undefined;
}
/**
 * Build query text for semantic retrieval from project name and transcript.
 * Falls back to project name only if transcript is unavailable or empty.
 */
export function buildQueryText(projectName, transcriptPath) {
    if (!transcriptPath)
        return projectName;
    const userMessage = extractFirstUserMessage(transcriptPath);
    if (!userMessage)
        return projectName;
    const truncated = userMessage.slice(0, QUERY_MAX_LENGTH);
    return `${projectName} ${truncated}`.trim();
}
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
    return { injectionText, results };
}
/**
 * Full async handler: initializes Embedder, generates query embedding,
 * retrieves experiences, and writes injection text to stdout.
 */
export async function handleSessionStart(stdin) {
    const ctx = await bootstrapHook(stdin);
    if (!ctx)
        return;
    try {
        const { Embedder } = await import("../retrieval/embedder.js");
        const embedder = new Embedder();
        try {
            await embedder.initialize();
            const sessionId = requireInputString(ctx.input, "session_id", "SessionStart");
            const cwd = ctx.input.cwd ?? "";
            const projectName = basename(cwd) || "unknown";
            const transcriptPath = ctx.input.transcript_path;
            const queryText = buildQueryText(projectName, transcriptPath);
            const queryEmbedding = await embedder.embed(queryText);
            const { injectionText, results } = retrieveAndInject(ctx, queryEmbedding, sessionId, queryText);
            if (injectionText) {
                process.stdout.write(injectionText);
            }
            const systemMsg = formatInjectionMessage(results, ctx.config.verbosity);
            if (systemMsg) {
                console.error(systemMsg);
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