/**
 * Memory GC — SPECIFICATION Section 4.4
 * Capacity management with eviction and optional LLM reflection.
 *
 * Design principle: important memories are never deleted.
 * Low-quality/stale entries are archived (soft delete).
 * Reflection generalizes lessons before archival.
 */
import { ExperienceStore } from "../store/experience-store.js";
import type { AcmConfig, ExperienceEntry } from "../store/types.js";
import type { EntryWithEmbedding } from "../store/experience-store.js";
export interface GcResult {
    project: string;
    before_count: number;
    after_count: number;
    archived_count: number;
    reflection_triggered: boolean;
    insights_generated: number;
}
export interface ReflectionResult {
    clusters_found: number;
    insights_generated: number;
    entries_archived: number;
}
/**
 * Simple greedy clustering by embedding similarity.
 * Groups entries where pairwise similarity exceeds threshold.
 */
export declare function clusterByEmbedding(entries: EntryWithEmbedding[], similarityThreshold?: number): EntryWithEmbedding[][];
/**
 * Generate a reflection insight prompt for Ollama from a cluster of entries.
 */
export declare function buildReflectionPrompt(entries: ExperienceEntry[]): string;
/**
 * Run capacity-based eviction for a project.
 * Does NOT run reflection — call runReflection separately if needed.
 */
export declare function runEviction(store: ExperienceStore, project: string, config: AcmConfig): {
    archived: number;
    before: number;
    after: number;
};
/**
 * Run LLM reflection for a project using Ollama.
 * Groups similar entries into clusters, generates insights, archives source entries.
 */
export declare function runReflection(store: ExperienceStore, project: string, config: AcmConfig, minClusterSize?: number): Promise<ReflectionResult>;
/**
 * Full GC cycle: check capacity → optionally reflect → evict excess.
 */
export declare function runGc(store: ExperienceStore, project: string, config: AcmConfig): Promise<GcResult>;
//# sourceMappingURL=gc.d.ts.map