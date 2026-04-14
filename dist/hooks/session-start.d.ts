/**
 * SessionStart hook — retrieval and context injection
 * Issue #40: feat(hooks): session-start hook
 * Issue #77: fix: use transcript-based query for semantic retrieval
 *
 * Retrieves relevant past experiences and outputs injection text to stdout.
 * The injection text is appended to the session context by Claude Code.
 */
import { type HookContext } from "./_common.js";
import type { RetrievalResult } from "../retrieval/types.js";
/**
 * Build query text for semantic retrieval from project name and transcript.
 * Falls back to project name only if transcript is unavailable or empty.
 */
export declare function buildQueryText(projectName: string, transcriptPath: string | undefined): string;
/**
 * Core logic: retrieve experiences, format injection text, and log injection event.
 * Separated from async Embedder initialization for testability.
 */
export interface RetrieveAndInjectResult {
    injectionText: string;
    results: RetrievalResult[];
}
export declare function retrieveAndInject(ctx: HookContext, queryEmbedding: Float32Array, sessionId: string, queryText: string): RetrieveAndInjectResult;
/**
 * Full async handler: initializes Embedder, generates query embedding,
 * retrieves experiences, and writes injection text to stdout.
 */
export declare function handleSessionStart(stdin: string): Promise<void>;
//# sourceMappingURL=session-start.d.ts.map