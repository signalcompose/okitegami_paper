/**
 * SessionEnd hook — experience generation with embedding
 * Issue #39: feat(hooks): session-end hook
 * Issue #76: fix: generate embedding at session-end
 * Issue #83: transcript-based corrective instruction detection
 *
 * Parses transcript → classifies corrections → records signals →
 * aggregates → generates experience entries → embeds → stores.
 */
export declare function handleSessionEnd(stdin: string): Promise<void>;
//# sourceMappingURL=session-end.d.ts.map