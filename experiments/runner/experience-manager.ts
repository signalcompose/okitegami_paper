/**
 * ExperienceManager — Hook-free experience lifecycle for experiment runner.
 *
 * Replaces hook-based signal collection with programmatic experience
 * generation based on test results (completion_rate).
 *
 * Manages shared experience DBs per condition so experiences accumulate
 * across sessions within the same experiment.
 */

import { join } from "node:path";
import { initializeDatabase } from "../../src/store/schema.js";
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
  async getStore(dbPath: string): Promise<ExperienceStore> {
    const existing = this.stores.get(dbPath);
    if (existing) return existing;

    try {
      const config: AcmConfig = { ...EXPERIMENT_ACM_CONFIG, db_path: dbPath };
      const db = await initializeDatabase(dbPath);
      const store = new ExperienceStore(db, config);
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
  async storeExperience(
    dbPath: string,
    entry: Omit<ExperienceEntry, "id">
  ): Promise<ExperienceEntry | null> {
    const store = await this.getStore(dbPath);
    return store.create(entry);
  }

  /**
   * Retrieve past experiences and format as injection text for the prompt.
   * Returns empty string for control condition or when no experiences exist.
   */
  async retrieveInjection(
    dbPath: string,
    taskDescription: string,
    condition?: ConditionName | string
  ): Promise<string> {
    if (condition !== undefined && !isAcmCondition(condition)) {
      return "";
    }

    const store = await this.getStore(dbPath);
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

interface ParsedVitest {
  total: number;
  passed: number;
  failed: string[];
}

/**
 * Parse vitest JSON output into structured result.
 * Returns null on parse failure (graceful degradation).
 */
function parseVitestOutput(vitestOutput: string): ParsedVitest | null {
  if (!vitestOutput) return null;

  let parsed: VitestJsonResult;
  try {
    parsed = JSON.parse(vitestOutput) as VitestJsonResult;
  } catch (err) {
    console.warn(
      `[ACM] parseVitestOutput: failed to parse vitest JSON (${vitestOutput.length} chars): ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }

  const total = parsed.numTotalTests;
  const passed = parsed.numPassedTests;
  if (typeof total !== "number" || typeof passed !== "number") {
    console.warn(
      `[ACM] parseVitestOutput: unexpected JSON shape — numTotalTests=${typeof total}, numPassedTests=${typeof passed}`
    );
    return null;
  }

  const failed: string[] = [];
  for (const suite of parsed.testResults ?? []) {
    for (const assertion of suite.assertionResults ?? []) {
      if (assertion.status === "failed") {
        failed.push(assertion.fullName);
      }
    }
  }
  return { total, passed, failed: failed.slice(0, MAX_FAILED_TESTS) };
}

/**
 * Extract failed test names from vitest JSON reporter output.
 * Returns up to MAX_FAILED_TESTS (5) names. Returns empty array on parse failure.
 */
export function extractFailedTests(vitestOutput: string): string[] {
  return parseVitestOutput(vitestOutput)?.failed ?? [];
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
    const p = parseVitestOutput(vitestOutput);
    if (p) {
      if (p.failed.length > 0) {
        return `Failed tests: ${p.failed.join(", ")}. ${p.passed}/${p.total} passed.`;
      }
      return `All tests passed (${p.passed}/${p.total}).`;
    }
    console.warn(
      "[ACM] buildOutcome: falling back to generic outcome — vitest output could not be parsed"
    );
  }

  return isSuccess
    ? `Task completed with ${(completionRate * 100).toFixed(0)}% test pass rate`
    : `Task incomplete: ${(completionRate * 100).toFixed(0)}% test pass rate`;
}
