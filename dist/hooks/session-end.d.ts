/**
 * SessionEnd hook — experience generation with embedding
 * Issue #39: feat(hooks): session-end hook
 * Issue #76: fix: generate embedding at session-end
 * Issue #83: transcript-based corrective instruction detection
 * Issue #90: migrate from Stop to SessionEnd event (fires once per session)
 *
 * Parses transcript → classifies corrections → records signals →
 * aggregates → generates experience entries → embeds → stores.
 *
 * SessionEnd fires exactly once per session, so idempotency guards are
 * retained only as safety nets (e.g., PreCompact may have already stored
 * corrective signals for this session).
 */
export declare function handleSessionEnd(stdin: string): Promise<void>;
//# sourceMappingURL=session-end.d.ts.map