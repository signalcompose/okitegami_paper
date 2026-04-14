/**
 * Tests for benchmark recording infrastructure — Issue #92
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  benchmarkResultSchema,
  benchmarkMetricsSchema,
  benchmarkConditionSchema,
  type BenchmarkResult,
} from "../types.js";
import {
  loadResults,
  aggregateByCondition,
  generateComparisonTable,
  formatMarkdownTable,
} from "../scripts/aggregate.js";

// --- Schema validation ---

describe("benchmarkResultSchema", () => {
  const validResult: BenchmarkResult = {
    benchmark: "swe-bench-cl",
    condition: "acm",
    run_id: "run-001",
    timestamp: "2026-04-14T12:00:00Z",
    metrics: {
      pass_at_1: 0.75,
      forward_transfer: 0.12,
      forgetting: 0.05,
      corrective_rate: 0.1,
    },
    metadata: {
      model_version: "claude-sonnet-4-20250514",
      acm_config: {
        max_experiences_per_project: 500,
        top_k: 5,
      },
      experience_count: 42,
    },
  };

  it("accepts valid benchmark result", () => {
    const parsed = benchmarkResultSchema.parse(validResult);
    expect(parsed.benchmark).toBe("swe-bench-cl");
    expect(parsed.condition).toBe("acm");
    expect(parsed.metrics.pass_at_1).toBe(0.75);
  });

  it("accepts result with minimal fields", () => {
    const minimal = {
      benchmark: "swe-exp",
      condition: "baseline",
      run_id: "run-002",
      timestamp: "2026-04-14T12:00:00Z",
      metrics: { pass_at_1: 0.5 },
      metadata: { model_version: "claude-sonnet-4-20250514" },
    };
    const parsed = benchmarkResultSchema.parse(minimal);
    expect(parsed.metrics.forward_transfer).toBeUndefined();
  });

  it("accepts result with per-task details", () => {
    const withTasks = {
      ...validResult,
      tasks: [
        { task_id: "t1", passed: true, duration_ms: 1234 },
        { task_id: "t2", passed: false, error: "Test failed" },
      ],
    };
    const parsed = benchmarkResultSchema.parse(withTasks);
    expect(parsed.tasks).toHaveLength(2);
    expect(parsed.tasks![1].passed).toBe(false);
  });

  it("rejects invalid condition", () => {
    expect(() => benchmarkConditionSchema.parse("invalid")).toThrow();
  });

  it("rejects pass_at_1 out of range", () => {
    expect(() => benchmarkMetricsSchema.parse({ pass_at_1: 1.5 })).toThrow();
  });

  it("rejects pass_at_1 below 0", () => {
    expect(() => benchmarkMetricsSchema.parse({ pass_at_1: -0.1 })).toThrow();
  });

  it("rejects missing required fields", () => {
    expect(() => benchmarkResultSchema.parse({ benchmark: "swe-bench-cl" })).toThrow();
  });

  it("rejects invalid timestamp format", () => {
    expect(() =>
      benchmarkResultSchema.parse({
        ...validResult,
        timestamp: "not-a-date",
      })
    ).toThrow();
  });
});

// --- Aggregation ---

describe("aggregation", () => {
  const makeResult = (
    condition: "baseline" | "acm",
    pass_at_1: number,
    overrides: Partial<BenchmarkResult> = {}
  ): BenchmarkResult => ({
    benchmark: "swe-bench-cl",
    condition,
    run_id: `run-${Math.random().toString(36).slice(2)}`,
    timestamp: "2026-04-14T12:00:00Z",
    metrics: { pass_at_1 },
    metadata: { model_version: "test" },
    ...overrides,
  });

  it("groups results by condition", () => {
    const results = [
      makeResult("baseline", 0.5),
      makeResult("baseline", 0.6),
      makeResult("acm", 0.7),
      makeResult("acm", 0.8),
    ];

    const summaries = aggregateByCondition(results);
    expect(summaries).toHaveLength(2);

    const acm = summaries.find((s) => s.condition === "acm");
    expect(acm).toBeDefined();
    expect(acm!.run_count).toBe(2);
    expect(acm!.mean_pass_at_1).toBeCloseTo(0.75, 4);
  });

  it("computes standard deviation", () => {
    const results = [makeResult("baseline", 0.4), makeResult("baseline", 0.6)];

    const summaries = aggregateByCondition(results);
    const baseline = summaries[0];
    expect(baseline.std_pass_at_1).toBeGreaterThan(0);
    // stddev of [0.4, 0.6] with sample correction = sqrt(0.02) ≈ 0.1414
    expect(baseline.std_pass_at_1).toBeCloseTo(0.1414, 3);
  });

  it("handles single result (std = 0)", () => {
    const results = [makeResult("acm", 0.9)];
    const summaries = aggregateByCondition(results);
    expect(summaries[0].std_pass_at_1).toBe(0);
  });

  it("handles empty results", () => {
    const summaries = aggregateByCondition([]);
    expect(summaries).toHaveLength(0);
  });

  it("includes optional metrics when present", () => {
    const results = [
      makeResult("acm", 0.7, {
        metrics: { pass_at_1: 0.7, forward_transfer: 0.1, forgetting: 0.02, corrective_rate: 0.05 },
      }),
      makeResult("acm", 0.8, {
        metrics: { pass_at_1: 0.8, forward_transfer: 0.2, forgetting: 0.03, corrective_rate: 0.1 },
      }),
    ];

    const summaries = aggregateByCondition(results);
    const acm = summaries[0];
    expect(acm.mean_forward_transfer).toBeCloseTo(0.15, 4);
    expect(acm.mean_forgetting).toBeCloseTo(0.025, 4);
    expect(acm.mean_corrective_rate).toBeCloseTo(0.075, 4);
  });

  it("leaves optional metrics undefined when not present", () => {
    const results = [makeResult("baseline", 0.5)];
    const summaries = aggregateByCondition(results);
    expect(summaries[0].mean_forward_transfer).toBeUndefined();
  });
});

describe("generateComparisonTable", () => {
  it("produces a ComparisonTable", () => {
    const results: BenchmarkResult[] = [
      {
        benchmark: "swe-exp",
        condition: "baseline",
        run_id: "r1",
        timestamp: "2026-04-14T12:00:00Z",
        metrics: { pass_at_1: 0.5 },
        metadata: { model_version: "test" },
      },
    ];

    const table = generateComparisonTable("swe-exp", results);
    expect(table.benchmark).toBe("swe-exp");
    expect(table.conditions).toHaveLength(1);
    expect(table.generated_at).toBeTruthy();
  });
});

describe("formatMarkdownTable", () => {
  it("generates readable markdown", () => {
    const table = generateComparisonTable("test", [
      {
        benchmark: "test",
        condition: "baseline",
        run_id: "r1",
        timestamp: "2026-04-14T12:00:00Z",
        metrics: { pass_at_1: 0.5 },
        metadata: { model_version: "test" },
      },
      {
        benchmark: "test",
        condition: "acm",
        run_id: "r2",
        timestamp: "2026-04-14T12:00:00Z",
        metrics: { pass_at_1: 0.8, corrective_rate: 0.1 },
        metadata: { model_version: "test" },
      },
    ]);

    const md = formatMarkdownTable(table);
    expect(md).toContain("Comparison Table");
    expect(md).toContain("baseline");
    expect(md).toContain("acm");
    expect(md).toContain("0.500");
    expect(md).toContain("0.800");
  });
});

// --- File I/O ---

describe("loadResults", () => {
  const testDir = join(tmpdir(), `acm-benchmark-test-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("loads valid JSON result files", () => {
    const result: BenchmarkResult = {
      benchmark: "swe-exp",
      condition: "baseline",
      run_id: "r1",
      timestamp: "2026-04-14T12:00:00Z",
      metrics: { pass_at_1: 0.6 },
      metadata: { model_version: "test" },
    };
    writeFileSync(join(testDir, "run-001.json"), JSON.stringify(result));

    const loaded = loadResults(testDir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].condition).toBe("baseline");
  });

  it("returns empty array for non-existent directory", () => {
    const loaded = loadResults("/nonexistent/path");
    expect(loaded).toHaveLength(0);
  });

  it("ignores non-JSON files", () => {
    writeFileSync(join(testDir, "readme.txt"), "ignore me");
    const result: BenchmarkResult = {
      benchmark: "swe-exp",
      condition: "acm",
      run_id: "r2",
      timestamp: "2026-04-14T12:00:00Z",
      metrics: { pass_at_1: 0.9 },
      metadata: { model_version: "test" },
    };
    writeFileSync(join(testDir, "run-002.json"), JSON.stringify(result));

    const loaded = loadResults(testDir);
    expect(loaded).toHaveLength(1);
  });

  it("skips invalid JSON files and returns valid ones", () => {
    writeFileSync(join(testDir, "bad.json"), '{"benchmark":"x"}');
    const valid: BenchmarkResult = {
      benchmark: "swe-exp",
      condition: "baseline",
      run_id: "r3",
      timestamp: "2026-04-14T12:00:00Z",
      metrics: { pass_at_1: 0.7 },
      metadata: { model_version: "test" },
    };
    writeFileSync(join(testDir, "good.json"), JSON.stringify(valid));

    const loaded = loadResults(testDir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].run_id).toBe("r3");
  });
});
