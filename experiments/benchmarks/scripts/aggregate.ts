/**
 * Benchmark Aggregation Script — Issue #92
 *
 * Reads benchmark result JSON files and generates condition-comparison tables.
 * Usage: npx tsx experiments/benchmarks/scripts/aggregate.ts <benchmark-name>
 *
 * Example:
 *   npx tsx experiments/benchmarks/scripts/aggregate.ts swe-bench-cl
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  benchmarkResultSchema,
  type BenchmarkResult,
  type BenchmarkCondition,
  type ConditionSummary,
  type ComparisonTable,
} from "../types.js";

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function optionalMean(values: (number | undefined)[]): number | undefined {
  const defined = values.filter((v): v is number => v !== undefined);
  return defined.length > 0 ? mean(defined) : undefined;
}

export function loadResults(resultsDir: string): BenchmarkResult[] {
  let files: string[];
  try {
    files = readdirSync(resultsDir).filter((f) => f.endsWith(".json"));
  } catch (err) {
    const code =
      err instanceof Error && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") {
      console.warn(`[benchmark] Results directory not found: ${resultsDir}`);
    } else {
      console.warn(
        `[benchmark] Cannot read ${resultsDir}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return [];
  }

  const results: BenchmarkResult[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(resultsDir, file), "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      results.push(benchmarkResultSchema.parse(parsed));
    } catch (err) {
      console.warn(
        `[benchmark] Skipping ${file}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return results;
}

export function aggregateByCondition(results: BenchmarkResult[]): ConditionSummary[] {
  const grouped = new Map<BenchmarkCondition, BenchmarkResult[]>();

  for (const result of results) {
    const existing = grouped.get(result.condition) ?? [];
    existing.push(result);
    grouped.set(result.condition, existing);
  }

  const summaries: ConditionSummary[] = [];
  for (const [condition, runs] of grouped) {
    const passAt1Values = runs.map((r) => r.metrics.pass_at_1);
    summaries.push({
      condition,
      run_count: runs.length,
      mean_pass_at_1: mean(passAt1Values),
      std_pass_at_1: stddev(passAt1Values),
      mean_forward_transfer: optionalMean(runs.map((r) => r.metrics.forward_transfer)),
      mean_forgetting: optionalMean(runs.map((r) => r.metrics.forgetting)),
      mean_corrective_rate: optionalMean(runs.map((r) => r.metrics.corrective_rate)),
    });
  }

  return summaries.sort((a, b) => a.condition.localeCompare(b.condition));
}

export function generateComparisonTable(
  benchmark: string,
  results: BenchmarkResult[]
): ComparisonTable {
  return {
    benchmark,
    conditions: aggregateByCondition(results),
    generated_at: new Date().toISOString(),
  };
}

export function formatMarkdownTable(table: ComparisonTable): string {
  const lines: string[] = [];
  lines.push(`## ${table.benchmark} — Comparison Table`);
  lines.push(`Generated: ${table.generated_at}`);
  lines.push("");

  const headers = [
    "Condition",
    "Runs",
    "Pass@1",
    "Std",
    "Fwd Transfer",
    "Forgetting",
    "Corrective",
  ];
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);

  for (const c of table.conditions) {
    const row = [
      c.condition,
      String(c.run_count),
      c.mean_pass_at_1.toFixed(3),
      c.std_pass_at_1.toFixed(3),
      c.mean_forward_transfer?.toFixed(3) ?? "-",
      c.mean_forgetting?.toFixed(3) ?? "-",
      c.mean_corrective_rate?.toFixed(3) ?? "-",
    ];
    lines.push(`| ${row.join(" | ")} |`);
  }

  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const benchmarkName = process.argv[2];
  if (!benchmarkName) {
    console.error("Usage: npx tsx experiments/benchmarks/scripts/aggregate.ts <benchmark-name>");
    process.exit(1);
  }

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const resultsDir = join(__dirname, "..", "results", benchmarkName);
  const results = loadResults(resultsDir);

  if (results.length === 0) {
    console.log(`No results found in ${resultsDir}`);
    process.exit(0);
  }

  const table = generateComparisonTable(benchmarkName, results);
  console.log(formatMarkdownTable(table));
  console.log("\nJSON:");
  console.log(JSON.stringify(table, null, 2));
}
