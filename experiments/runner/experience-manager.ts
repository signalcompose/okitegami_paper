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
import type { ConditionName, TaskName, ContextSize, VitestJsonResult } from "../harness/types.js";
import { isAcmCondition } from "./types.js";

export interface GenerateInput {
  sessionId: string;
  completionRate: number; // 0.0–1.0
  taskDescription: string; // TASK.md content summary
  claudeOutput: string; // Claude's response (for action/outcome)
  vitestOutput?: string; // vitest JSON reporter output
  eslintOutput?: string; // ESLint JSON output (task-c)
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

    try {
      mkdirSync(dirname(dbPath), { recursive: true });
      const config: AcmConfig = { ...EXPERIMENT_ACM_CONFIG, db_path: dbPath };
      const store = new ExperienceStore(config);
      this.stores.set(dbPath, store);
      return store;
    } catch (err) {
      throw new Error(
        `ExperienceManager: failed to open experience DB at "${dbPath}": ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
    }
  }

  /**
   * Generate an experience entry from session results.
   * Uses completion_rate as signal_strength (no hook-based signals needed).
   */
  generateExperience(input: GenerateInput): Omit<ExperienceEntry, "id"> | null {
    const { sessionId, completionRate, taskDescription, claudeOutput, vitestOutput } = input;

    const isSuccess = completionRate >= 0.8;
    const type: "success" | "failure" = isSuccess ? "success" : "failure";

    // Use completion_rate as signal_strength, with minimum 0.1 for failures
    // so they are still stored (above promotion_threshold 0.0)
    const signalStrength = isSuccess ? completionRate : Math.max(completionRate, 0.1);

    // Extract simple retrieval keys from task description
    const retrievalKeys = extractSimpleKeys(taskDescription);

    // Build trigger from task description (first 200 chars)
    const trigger = taskDescription.slice(0, 200);

    // Build action from claude output (strip CVI noise, first 200 chars)
    const cleanOutput = stripCviContent(claudeOutput);
    const outputSummary = cleanOutput.slice(0, 200) || "(no output)";
    const action = isSuccess
      ? `Agent completed task: ${outputSummary}`
      : `Agent attempted task: ${outputSummary}`;

    // Build outcome with actionable detail from vitest output
    const outcome = buildOutcome(isSuccess, completionRate, vitestOutput);

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

    // For hook-free mode, use list-based retrieval sorted by signal_strength; take top_k
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
    const errors: string[] = [];
    for (const [dbPath, store] of this.stores.entries()) {
      try {
        store.close();
      } catch (err) {
        errors.push(`${dbPath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    this.stores.clear();
    if (errors.length > 0) {
      console.warn(`[ACM] Errors closing experience DBs:\n${errors.join("\n")}`);
    }
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

const MAX_FAILED_TESTS = 5;

/**
 * Extract failed test names from vitest JSON reporter output.
 * Returns empty array on parse failure (graceful degradation).
 */
export function extractFailedTests(vitestOutput: string): string[] {
  if (!vitestOutput) return [];
  try {
    const parsed = JSON.parse(vitestOutput) as VitestJsonResult;
    const failed: string[] = [];
    for (const suite of parsed.testResults) {
      for (const assertion of suite.assertionResults) {
        if (assertion.status === "failed") {
          failed.push(assertion.fullName);
        }
      }
    }
    return failed.slice(0, MAX_FAILED_TESTS);
  } catch {
    return [];
  }
}

/**
 * Strip CVI Voice patterns from Claude's stdout.
 * Removes `Voice: "..."` and `[VOICE]...[/VOICE]` patterns.
 */
export function stripCviContent(text: string): string {
  return text
    .replace(/Voice:\s*(?:"[^"]*"|'[^']*')/g, "")
    .replace(/\[VOICE\][\s\S]*?\[\/VOICE\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build an actionable outcome string from vitest results.
 * Falls back to generic percentage-based outcome when vitest data is unavailable.
 */
function buildOutcome(isSuccess: boolean, completionRate: number, vitestOutput?: string): string {
  if (vitestOutput) {
    try {
      const parsed = JSON.parse(vitestOutput) as VitestJsonResult;
      const total = parsed.numTotalTests;
      const passed = parsed.numPassedTests;

      if (typeof total !== "number" || typeof passed !== "number") {
        // Missing numeric fields — fall through to generic outcome
      } else {
        const failed: string[] = [];
        for (const suite of parsed.testResults ?? []) {
          for (const assertion of suite.assertionResults ?? []) {
            if (assertion.status === "failed") {
              failed.push(assertion.fullName);
            }
          }
        }
        const capped = failed.slice(0, MAX_FAILED_TESTS);

        if (capped.length > 0) {
          return `Failed tests: ${capped.join(", ")}. ${passed}/${total} passed.`;
        }
        return `All tests passed (${passed}/${total}).`;
      }
    } catch {
      // Fall through to generic outcome
    }
  }

  return isSuccess
    ? `Task completed with ${(completionRate * 100).toFixed(0)}% test pass rate`
    : `Task incomplete: ${(completionRate * 100).toFixed(0)}% test pass rate`;
}
