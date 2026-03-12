/**
 * SessionStart hook — retrieval and context injection
 * Issue #40: feat(hooks): session-start hook
 *
 * Retrieves relevant past experiences and outputs injection text to stdout.
 * The injection text is appended to the session context by Claude Code.
 */
import { type HookContext } from "./_common.js";
/**
 * Core logic: retrieve experiences, format injection text, and log injection event.
 * Separated from async Embedder initialization for testability.
 */
export declare function retrieveAndInject(ctx: HookContext, queryEmbedding: Float32Array, sessionId: string, queryText: string): string;
/**
 * Full async handler: initializes Embedder, generates query embedding,
 * retrieves experiences, and writes injection text to stdout.
 */
export declare function handleSessionStart(stdin: string): Promise<void>;
//# sourceMappingURL=session-start.d.ts.map