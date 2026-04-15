/**
 * Benchmark Recording Infrastructure — Issue #92
 * Types and Zod schemas for recording and comparing benchmark results.
 */
import { z } from "zod";

// --- Condition ---

export const BENCHMARK_CONDITIONS = ["baseline", "acm", "mem0"] as const;
export type BenchmarkCondition = (typeof BENCHMARK_CONDITIONS)[number];

export const benchmarkConditionSchema = z.enum(BENCHMARK_CONDITIONS);

// --- Metrics ---

export const benchmarkMetricsSchema = z.object({
  pass_at_1: z.number().min(0).max(1).describe("Pass@1 rate"),
  forward_transfer: z
    .number()
    .finite()
    .optional()
    .describe("Forward transfer score (SWE-Bench-CL)"),
  forgetting: z.number().finite().min(0).optional().describe("Forgetting score (SWE-Bench-CL)"),
  corrective_rate: z.number().min(0).max(1).optional().describe("Corrective instruction rate"),
  completion_rate: z.number().min(0).max(1).optional().describe("Task completion rate"),
  cl_f_beta: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("CL-Fβ: harmonic mean of plasticity and stability"),
  cl_score: z.number().finite().optional().describe("CL-Score: composite continual learning score"),
});

export type BenchmarkMetrics = z.infer<typeof benchmarkMetricsSchema>;

// --- Metadata ---

export const benchmarkMetadataSchema = z.object({
  model_version: z.string().describe("LLM model version (e.g., claude-sonnet-4-20250514)"),
  acm_config: z
    .object({
      max_experiences_per_project: z.number().optional(),
      top_k: z.number().optional(),
      recency_half_life_days: z.number().optional(),
      mode: z.string().optional(),
    })
    .optional()
    .describe("ACM configuration (only for acm condition)"),
  experience_count: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of experiences at run time"),
  environment: z.string().optional().describe("Runtime environment description"),
  run_command: z.string().optional().describe("Command used to execute the benchmark"),
  seed: z.number().int().optional().describe("Random seed for reproducibility"),
  notes: z.string().optional().describe("Free-form notes"),
});

export type BenchmarkMetadata = z.infer<typeof benchmarkMetadataSchema>;

// --- Result ---

export const benchmarkResultSchema = z.object({
  benchmark: z.string().describe("Benchmark name (e.g., swe-bench-cl, swe-exp)"),
  condition: benchmarkConditionSchema,
  run_id: z.string().describe("Unique run identifier"),
  timestamp: z.string().datetime().describe("ISO 8601 timestamp"),
  metrics: benchmarkMetricsSchema,
  metadata: benchmarkMetadataSchema,
  tasks: z
    .array(
      z.object({
        task_id: z.string(),
        passed: z.boolean(),
        duration_ms: z.number().optional(),
        error: z.string().optional(),
      })
    )
    .optional()
    .describe("Per-task results"),
});

export type BenchmarkResult = z.infer<typeof benchmarkResultSchema>;

// --- Aggregated comparison ---

export interface ConditionSummary {
  condition: BenchmarkCondition;
  run_count: number;
  mean_pass_at_1: number;
  std_pass_at_1: number;
  mean_forward_transfer?: number;
  mean_forgetting?: number;
  mean_corrective_rate?: number;
  mean_completion_rate?: number;
  mean_cl_f_beta?: number;
  mean_cl_score?: number;
}

export interface ComparisonTable {
  benchmark: string;
  conditions: ConditionSummary[];
  generated_at: string;
}
