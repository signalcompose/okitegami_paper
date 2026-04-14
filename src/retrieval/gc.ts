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
import { cosineSimilarity } from "./similarity.js";
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
export function clusterByEmbedding(
  entries: EntryWithEmbedding[],
  similarityThreshold: number = 0.75
): EntryWithEmbedding[][] {
  const assigned = new Set<number>();
  const clusters: EntryWithEmbedding[][] = [];

  for (let i = 0; i < entries.length; i++) {
    if (assigned.has(i)) continue;

    const cluster: EntryWithEmbedding[] = [entries[i]];
    assigned.add(i);

    for (let j = i + 1; j < entries.length; j++) {
      if (assigned.has(j)) continue;
      try {
        const sim = cosineSimilarity(entries[i].embedding, entries[j].embedding);
        if (sim >= similarityThreshold) {
          cluster.push(entries[j]);
          assigned.add(j);
        }
      } catch {
        // Dimension mismatch — skip
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

/**
 * Generate a reflection insight prompt for Ollama from a cluster of entries.
 */
export function buildReflectionPrompt(entries: ExperienceEntry[]): string {
  const experiences = entries
    .map(
      (e, i) =>
        `${i + 1}. [${e.type}] trigger="${e.trigger}" action="${e.action}" outcome="${e.outcome}"`
    )
    .join("\n");

  return (
    `You are an AI experience analyzer. Given the following similar experiences from a coding assistant, ` +
    `generate a single generalized insight that captures the common lesson.\n\n` +
    `Experiences:\n${experiences}\n\n` +
    `Respond with a JSON object: {"trigger": "generalized task pattern", "action": "recommended approach", "outcome": "expected result", "retrieval_keys": ["key1", "key2", ...]}`
  );
}

/**
 * Run capacity-based eviction for a project.
 * Does NOT run reflection — call runReflection separately if needed.
 */
export function runEviction(
  store: ExperienceStore,
  project: string,
  config: AcmConfig
): { archived: number; before: number; after: number } {
  const before = store.countActiveByProject(project);
  const excess = before - config.max_experiences_per_project;
  if (excess <= 0) return { archived: 0, before, after: before };

  const candidates = store.getEvictionCandidates(project, excess);
  let archived = 0;
  for (const entry of candidates) {
    if (store.archive(entry.id)) archived++;
  }

  return { archived, before, after: before - archived };
}

/**
 * Run LLM reflection for a project using Ollama.
 * Groups similar entries into clusters, generates insights, archives source entries.
 */
export async function runReflection(
  store: ExperienceStore,
  project: string,
  config: AcmConfig,
  minClusterSize: number = 3
): Promise<ReflectionResult> {
  const entries = store.getActiveWithEmbeddingByProject(project);
  const clusters = clusterByEmbedding(entries);

  const largeClusters = clusters.filter((c) => c.length >= minClusterSize);
  let insightsGenerated = 0;
  let entriesArchived = 0;

  for (const cluster of largeClusters) {
    const clusterEntries = cluster.map((c) => c.entry);
    const prompt = buildReflectionPrompt(clusterEntries);

    try {
      const insight = await callOllamaForInsight(
        prompt,
        config.ollama_url ?? "http://localhost:11434",
        config.ollama_model ?? "gemma2:2b"
      );

      if (insight) {
        // Store insight as new experience entry
        store.create({
          type: "insight",
          trigger: insight.trigger,
          action: insight.action,
          outcome: insight.outcome,
          retrieval_keys: insight.retrieval_keys,
          signal_strength: 0.8,
          signal_type: "uninterrupted_completion",
          session_id: `reflection-${Date.now()}`,
          timestamp: new Date().toISOString(),
          project,
        });
        insightsGenerated++;

        // Archive source entries
        for (const entry of clusterEntries) {
          if (store.archive(entry.id)) entriesArchived++;
        }
      }
    } catch (err) {
      console.error(
        `[ACM] reflection: failed to generate insight for cluster (${cluster.length} entries): ` +
          `${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return {
    clusters_found: largeClusters.length,
    insights_generated: insightsGenerated,
    entries_archived: entriesArchived,
  };
}

interface InsightData {
  trigger: string;
  action: string;
  outcome: string;
  retrieval_keys: string[];
}

async function callOllamaForInsight(
  prompt: string,
  ollamaUrl: string,
  model: string
): Promise<InsightData | null> {
  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0 } }),
  });

  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as { response?: string };
  if (!data.response) return null;

  // Extract JSON from response (may be wrapped in markdown code block)
  const jsonMatch = data.response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  if (
    typeof parsed.trigger !== "string" ||
    typeof parsed.action !== "string" ||
    typeof parsed.outcome !== "string" ||
    !Array.isArray(parsed.retrieval_keys)
  ) {
    return null;
  }

  return {
    trigger: parsed.trigger,
    action: parsed.action,
    outcome: parsed.outcome,
    retrieval_keys: parsed.retrieval_keys.filter((k): k is string => typeof k === "string"),
  };
}

/**
 * Full GC cycle: check capacity → optionally reflect → evict excess.
 */
export async function runGc(
  store: ExperienceStore,
  project: string,
  config: AcmConfig
): Promise<GcResult> {
  const beforeCount = store.countActiveByProject(project);
  const reflectionThreshold = Math.floor(config.max_experiences_per_project * 0.8);
  let reflectionTriggered = false;
  let insightsGenerated = 0;

  // Run reflection if approaching capacity
  if (beforeCount >= reflectionThreshold) {
    reflectionTriggered = true;
    try {
      const reflectionResult = await runReflection(store, project, config);
      insightsGenerated = reflectionResult.insights_generated;
    } catch (err) {
      console.error(
        `[ACM] gc: reflection failed for project "${project}": ` +
          `${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Run eviction if still over capacity
  const { archived } = runEviction(store, project, config);
  const afterCount = store.countActiveByProject(project);

  return {
    project,
    before_count: beforeCount,
    after_count: afterCount,
    archived_count: archived,
    reflection_triggered: reflectionTriggered,
    insights_generated: insightsGenerated,
  };
}
