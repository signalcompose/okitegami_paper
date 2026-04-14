/**
 * PreCompact hook — corrective signal preservation before compaction
 * Issue #90: feat: migrate to SessionEnd + PreCompact hook pair
 *
 * Runs before context compaction to analyze the current transcript and
 * preserve corrective signals that would otherwise be lost when the
 * transcript is truncated. PreCompact cannot block compaction; it runs
 * before compaction begins. Best-effort preservation.
 */
export declare function handlePreCompact(stdin: string): Promise<void>;
//# sourceMappingURL=pre-compact.d.ts.map