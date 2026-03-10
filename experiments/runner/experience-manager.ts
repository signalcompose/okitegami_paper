/**
 * ExperienceManager — Hook-free experience lifecycle for experiment runner.
 *
 * Replaces hook-based signal collection with programmatic experience
 * generation based on test results (completion_rate).
 *
 * Manages shared experience DBs per condition so experiences accumulate
 * across sessions within the same experiment.
 */

import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { ExperienceStore } from "../../src/store/experience-store.js";
import { formatInjection } from "../../src/retrieval/injector.js";
import type { ExperienceEntry, AcmConfig } from "../../src/store/types.js";
import type { ConditionName, TaskName, ContextSize } from "../harness/types.js";
import { isAcmCondition } from "./types.js";

export interface GenerateInput {
  sessionId: string;
  completionRate: number; // 0.0–1.0
  taskDescription: string; // TASK.md content summary
  claudeOutput: string; // Claude's response (for action/outcome)
}

const EXPERIMENT_ACM_CONFIG: AcmConfig = {
  mode: "full",
  top_k: 5,
  capture_turns: 5,
  promotion_threshold: 0.0, // Record all outcomes in experiments
  db_path: "", // Set dynamically per DB
};

export class ExperienceManager {
  private stores = new Map<string, ExperienceStore>();

  constructor(private resultsDir: string) {}

  /**
   * Compute the DB file path for a given experiment/condition/task/context combination.
   */
  getDbPath(
    experimentId: string,
    condition: ConditionName | string,
    task: TaskName | string,
    contextSize: ContextSize | string
  ): string {
    return join(this.resultsDir, experimentId, `${condition}_${task}_${contextSize}.db`);
  }

  /**
   * Get or create an ExperienceStore for a given DB path.
   * Caches store instances so the same DB is not opened multiple times.
   */
  getStore(dbPath: string): ExperienceStore {
    const existing = this.stores.get(dbPath);
    if (existing) return existing;

    mkdirSync(dirname(dbPath), { recursive: true });

    const config: AcmConfig = { ...EXPERIMENT_ACM_CONFIG, db_path: dbPath };
    const store = new ExperienceStore(config);
    this.stores.set(dbPath, store);
    return store;
  }

  /**
   * Generate an experience entry from session results.
   * Uses completion_rate as signal_strength (no hook-based signals needed).
   */
  generateExperience(input: GenerateInput): Omit<ExperienceEntry, "id"> | null {
    const { sessionId, completionRate, taskDescription, claudeOutput } = input;

    const isSuccess = completionRate >= 0.8;
    const type: "success" | "failure" = isSuccess ? "success" : "failure";

    // Use completion_rate as signal_strength, with minimum 0.1 for failures
    // so they are still stored (above promotion_threshold 0.0)
    const signalStrength = Math.max(completionRate, 0.1);

    // Extract simple retrieval keys from task description
    const retrievalKeys = extractSimpleKeys(taskDescription);

    // Build trigger from task description (first 200 chars)
    const trigger = taskDescription.slice(0, 200);

    // Build action from claude output (first 200 chars)
    const outputSummary = claudeOutput.slice(0, 200) || "(no output)";
    const action = isSuccess
      ? `Agent completed task: ${outputSummary}`
      : `Agent attempted task: ${outputSummary}`;

    // Build outcome
    const outcome = isSuccess
      ? `Task completed with ${(completionRate * 100).toFixed(0)}% test pass rate`
      : `Task incomplete: ${(completionRate * 100).toFixed(0)}% test pass rate`;

    return {
      type,
      trigger,
      action,
      outcome,
      retrieval_keys: retrievalKeys,
      signal_strength: signalStrength,
      signal_type: "uninterrupted_completion",
      session_id: sessionId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Store an experience entry in the shared DB.
   */
  storeExperience(dbPath: string, entry: Omit<ExperienceEntry, "id">): ExperienceEntry | null {
    const store = this.getStore(dbPath);
    return store.create(entry);
  }

  /**
   * Retrieve past experiences and format as injection text for the prompt.
   * Returns empty string for control condition or when no experiences exist.
   */
  retrieveInjection(
    dbPath: string,
    taskDescription: string,
    condition?: ConditionName | string
  ): string {
    if (condition !== undefined && !isAcmCondition(condition)) {
      return "";
    }

    const store = this.getStore(dbPath);
    const experiences = store.list({ limit: 50 });

    if (experiences.length === 0) return "";

    // For hook-free mode, we don't have embeddings, so use simple list-based retrieval
    // Format all experiences using the injector
    const results = experiences.map((entry) => ({
      entry,
      similarity: 1.0, // No embedding-based similarity in hook-free mode
      score: entry.signal_strength,
    }));

    // Sort by score descending and take top_k
    results.sort((a, b) => b.score - a.score);
    const topK = results.slice(0, EXPERIMENT_ACM_CONFIG.top_k);

    return formatInjection(topK);
  }

  /**
   * Close all open DB connections.
   */
  closeAll(): void {
    for (const store of this.stores.values()) {
      store.close();
    }
    this.stores.clear();
  }
}

/**
 * Extract simple keywords from text for retrieval_keys.
 */
function extractSimpleKeys(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);

  // Deduplicate and take first 10
  return [...new Set(words)].slice(0, 10);
}
