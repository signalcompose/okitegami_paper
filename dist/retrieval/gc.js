import { cosineSimilarity } from "./similarity.js";
/**
 * Simple greedy clustering by embedding similarity.
 * Groups entries where pairwise similarity exceeds threshold.
 *
 * Known limitation: order-dependent and non-transitive. If A≈B and B≈C
 * but A≉C, B joins A's cluster first, leaving C isolated. Acceptable
 * for research prototype — exact clustering is not required for reflection.
 */
export function clusterByEmbedding(entries, similarityThreshold = 0.75) {
    const assigned = new Set();
    const clusters = [];
    for (let i = 0; i < entries.length; i++) {
        if (assigned.has(i))
            continue;
        const cluster = [entries[i]];
        assigned.add(i);
        for (let j = i + 1; j < entries.length; j++) {
            if (assigned.has(j))
                continue;
            try {
                const sim = cosineSimilarity(entries[i].embedding, entries[j].embedding);
                if (sim >= similarityThreshold) {
                    cluster.push(entries[j]);
                    assigned.add(j);
                }
            }
            catch {
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
export function buildReflectionPrompt(entries) {
    const experiences = entries
        .map((e, i) => `${i + 1}. [${e.type}] trigger="${e.trigger}" action="${e.action}" outcome="${e.outcome}"`)
        .join("\n");
    return (`You are an AI experience analyzer. Given the following similar experiences from a coding assistant, ` +
        `generate a single generalized insight that captures the common lesson.\n\n` +
        `Experiences:\n${experiences}\n\n` +
        `Respond with a JSON object: {"trigger": "generalized task pattern", "action": "recommended approach", "outcome": "expected result", "retrieval_keys": ["key1", "key2", ...]}`);
}
/**
 * Run capacity-based eviction for a project.
 * Does NOT run reflection — call runReflection separately if needed.
 */
export function runEviction(store, project, config) {
    const before = store.countActiveByProject(project);
    const excess = before - config.max_experiences_per_project;
    if (excess <= 0)
        return { archived: 0, before, after: before };
    const candidates = store.getEvictionCandidates(project, excess);
    let archived = 0;
    for (const entry of candidates) {
        if (store.archive(entry.id))
            archived++;
    }
    return { archived, before, after: before - archived };
}
/**
 * Run LLM reflection for a project using Ollama.
 * Groups similar entries into clusters, generates insights, archives source entries.
 */
export async function runReflection(store, project, config, minClusterSize = 3) {
    const entries = store.getActiveWithEmbeddingByProject(project);
    const clusters = clusterByEmbedding(entries);
    const largeClusters = clusters.filter((c) => c.length >= minClusterSize);
    let insightsGenerated = 0;
    let entriesArchived = 0;
    for (const cluster of largeClusters) {
        const clusterEntries = cluster.map((c) => c.entry);
        const prompt = buildReflectionPrompt(clusterEntries);
        try {
            const insight = await callOllamaForInsight(prompt, config.ollama_url ?? "http://localhost:11434", config.ollama_model ?? "gemma2:2b");
            if (insight) {
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
                for (const entry of clusterEntries) {
                    if (store.archive(entry.id))
                        entriesArchived++;
                }
            }
        }
        catch (err) {
            console.error(`[ACM] reflection: failed to generate insight for cluster (${cluster.length} entries): ` +
                `${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return {
        clusters_found: largeClusters.length,
        insights_generated: insightsGenerated,
        entries_archived: entriesArchived,
    };
}
const OLLAMA_TIMEOUT_MS = 30_000;
async function callOllamaForInsight(prompt, ollamaUrl, model) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
    try {
        const response = await fetch(`${ollamaUrl}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0 } }),
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`Ollama returned HTTP ${response.status}`);
        }
        const data = (await response.json());
        if (!data.response)
            return null;
        const jsonMatch = data.response.match(/\{[\s\S]*\}/);
        if (!jsonMatch)
            return null;
        const parsed = JSON.parse(jsonMatch[0]);
        if (typeof parsed.trigger !== "string" ||
            typeof parsed.action !== "string" ||
            typeof parsed.outcome !== "string" ||
            !Array.isArray(parsed.retrieval_keys)) {
            return null;
        }
        return {
            trigger: parsed.trigger,
            action: parsed.action,
            outcome: parsed.outcome,
            retrieval_keys: parsed.retrieval_keys.filter((k) => typeof k === "string"),
        };
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * Full GC cycle: check capacity → optionally reflect → evict excess.
 */
export async function runGc(store, project, config) {
    const beforeCount = store.countActiveByProject(project);
    const reflectionThreshold = Math.floor(config.max_experiences_per_project * 0.8);
    let reflectionTriggered = false;
    let insightsGenerated = 0;
    if (beforeCount >= reflectionThreshold) {
        reflectionTriggered = true;
        try {
            const reflectionResult = await runReflection(store, project, config);
            insightsGenerated = reflectionResult.insights_generated;
        }
        catch (err) {
            console.error(`[ACM] gc: reflection failed for project "${project}": ` +
                `${err instanceof Error ? err.message : String(err)}`);
        }
    }
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
//# sourceMappingURL=gc.js.map