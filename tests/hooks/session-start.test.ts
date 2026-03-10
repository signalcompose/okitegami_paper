/**
 * Tests for session-start hook — retrieval and context injection
 * Issue #40: feat(hooks): session-start hook
 *
 * Tests core logic without loading the actual ML model (Embedder).
 * Uses pre-computed embeddings to test retrieval + injection pipeline.
 */

import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { retrieveAndInject } from "../../src/hooks/session-start.js";
import { bootstrapHook } from "../../src/hooks/_common.js";
import type { ExperienceEntry } from "../../src/store/types.js";

const TMP_DIR = join(tmpdir(), "acm-test-session-start");
const EMBEDDING_DIM = 384;

function setupEnv(mode: string = "full"): string {
  mkdirSync(TMP_DIR, { recursive: true });
  const dbPath = join(TMP_DIR, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const configPath = join(
    TMP_DIR,
    `config-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  writeFileSync(
    configPath,
    JSON.stringify({
      mode,
      db_path: dbPath,
      promotion_threshold: 0.1,
      top_k: 3,
    })
  );
  process.env.ACM_CONFIG_PATH = configPath;
  return dbPath;
}

function makeFakeEmbedding(seed: number): Float32Array {
  const arr = new Float32Array(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    arr[i] = Math.sin(seed * (i + 1));
  }
  // Normalize
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) norm += arr[i] * arr[i];
  norm = Math.sqrt(norm);
  for (let i = 0; i < EMBEDDING_DIM; i++) arr[i] /= norm;
  return arr;
}

function insertExperienceWithEmbedding(
  dbPath: string,
  entry: Omit<ExperienceEntry, "id">,
  embedding: Float32Array
): void {
  const ctx = bootstrapHook(JSON.stringify({ session_id: "setup" }));
  if (!ctx) throw new Error("Failed to bootstrap for test setup");
  ctx.experienceStore.createWithEmbedding(entry, embedding);
  ctx.cleanup();
}

describe("session-start hook: retrieveAndInject", () => {
  const originalEnv = process.env.ACM_CONFIG_PATH;

  afterEach(() => {
    process.env.ACM_CONFIG_PATH = originalEnv;
    try {
      rmSync(TMP_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("returns injection text when experiences exist", () => {
    setupEnv();
    const emb1 = makeFakeEmbedding(1);

    insertExperienceWithEmbedding(
      process.env.ACM_CONFIG_PATH!,
      {
        type: "failure",
        trigger: "Tool Bash failed: syntax error",
        action: "Agent used Bash before interrupt",
        outcome: "User corrected syntax",
        retrieval_keys: ["bash", "syntax"],
        signal_strength: 0.95,
        signal_type: "interrupt_with_dialogue",
        session_id: "past-1",
        timestamp: new Date().toISOString(),
        interrupt_context: { turns_captured: 2, dialogue_summary: "Fix the syntax" },
      },
      emb1
    );

    const ctx = bootstrapHook(JSON.stringify({ session_id: "new-session" }));
    const queryEmbedding = makeFakeEmbedding(1); // Same seed = high similarity
    const result = retrieveAndInject(ctx!, queryEmbedding);
    ctx!.cleanup();

    expect(result).toContain("[ACM Context]");
    expect(result).toContain("FAILURE");
    expect(result).toContain("syntax error");
  });

  it("returns empty string when DB is empty", () => {
    setupEnv();

    const ctx = bootstrapHook(JSON.stringify({ session_id: "empty-session" }));
    const queryEmbedding = makeFakeEmbedding(42);
    const result = retrieveAndInject(ctx!, queryEmbedding);
    ctx!.cleanup();

    expect(result).toBe("");
  });

  it("returns empty string when mode is disabled", () => {
    setupEnv("disabled");
    // bootstrapHook returns null for disabled mode, so retrieveAndInject won't be called
    const ctx = bootstrapHook(JSON.stringify({ session_id: "disabled-session" }));
    expect(ctx).toBeNull();
  });

  it("respects top-K limit", () => {
    setupEnv(); // top_k: 3

    // Insert 5 experiences
    for (let i = 1; i <= 5; i++) {
      insertExperienceWithEmbedding(
        process.env.ACM_CONFIG_PATH!,
        {
          type: "success",
          trigger: `Task ${i}`,
          action: `Action ${i}`,
          outcome: `Outcome ${i}`,
          retrieval_keys: [`task${i}`],
          signal_strength: 0.5 + i * 0.05,
          signal_type: "uninterrupted_completion",
          session_id: `past-${i}`,
          timestamp: new Date().toISOString(),
        },
        makeFakeEmbedding(i)
      );
    }

    const ctx = bootstrapHook(JSON.stringify({ session_id: "topk-session" }));
    const queryEmbedding = makeFakeEmbedding(3); // Most similar to entry 3
    const result = retrieveAndInject(ctx!, queryEmbedding);
    ctx!.cleanup();

    // Should have at most 3 entries (top_k=3)
    const successCount = (result.match(/SUCCESS/g) || []).length;
    expect(successCount).toBeLessThanOrEqual(3);
  });

  it("returns results ordered by score (similarity × strength)", () => {
    setupEnv();

    // High similarity + high strength should rank first
    insertExperienceWithEmbedding(
      process.env.ACM_CONFIG_PATH!,
      {
        type: "failure",
        trigger: "High relevance failure",
        action: "Action A",
        outcome: "Outcome A",
        retrieval_keys: ["high"],
        signal_strength: 0.95,
        signal_type: "interrupt_with_dialogue",
        session_id: "past-high",
        timestamp: new Date().toISOString(),
        interrupt_context: { turns_captured: 3, dialogue_summary: "Important fix" },
      },
      makeFakeEmbedding(10)
    );

    // Low similarity should rank lower
    insertExperienceWithEmbedding(
      process.env.ACM_CONFIG_PATH!,
      {
        type: "success",
        trigger: "Low relevance success",
        action: "Action B",
        outcome: "Outcome B",
        retrieval_keys: ["low"],
        signal_strength: 0.4,
        signal_type: "uninterrupted_completion",
        session_id: "past-low",
        timestamp: new Date().toISOString(),
      },
      makeFakeEmbedding(99)
    );

    const ctx = bootstrapHook(JSON.stringify({ session_id: "order-session" }));
    const queryEmbedding = makeFakeEmbedding(10); // Similar to first entry
    const result = retrieveAndInject(ctx!, queryEmbedding);
    ctx!.cleanup();

    // FAILURE (high score) should appear before SUCCESS (low score)
    const failurePos = result.indexOf("FAILURE");
    const successPos = result.indexOf("SUCCESS");
    if (failurePos >= 0 && successPos >= 0) {
      expect(failurePos).toBeLessThan(successPos);
    }
  });
});
