import { RunSpec, RunResult } from "../harness/types.js";
import { TaskEvaluator } from "../harness/task-evaluator.js";
import { MetricCollector } from "../harness/metric-collector.js";
import { ReportGenerator } from "../harness/report-generator.js";
import { SessionOrchestrator, OrchestratorOptions } from "./session-orchestrator.js";
import { RunMatrix } from "./run-matrix.js";
import { MilestoneFilter, TASK_DIRS } from "./types.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";

const execFileAsync = promisify(execFile);

export interface ExperimentOptions extends OrchestratorOptions {
  results_dir: string; // Path to experiments/results/
}

export class ExperimentRunner {
  private orchestrator: SessionOrchestrator;
  private evaluator: TaskEvaluator;
  private collector: MetricCollector;
  private reportGenerator: ReportGenerator;
  private options: ExperimentOptions;

  constructor(options: ExperimentOptions) {
    this.options = options;
    this.orchestrator = new SessionOrchestrator(options);
    this.evaluator = new TaskEvaluator();
    this.collector = new MetricCollector();
    this.reportGenerator = new ReportGenerator();
  }

  /**
   * Run the vitest tests in a task directory and return JSON output
   */
  private async runTaskTests(task: string): Promise<string> {
    const taskDir = resolve(this.options.tasks_dir, TASK_DIRS[task] ?? task);
    try {
      const { stdout } = await execFileAsync("npx", ["vitest", "run", "--reporter=json"], {
        cwd: taskDir,
        timeout: 60_000,
      });
      return stdout;
    } catch (err: unknown) {
      // vitest exits with non-zero on test failures, but still outputs JSON
      const error = err as { stdout?: string; stderr?: string; code?: string | number };
      if (error.stdout && error.stdout.includes('"numTotalTests"')) {
        return error.stdout;
      }
      // Genuine process error (ENOENT, timeout, etc.) — propagate
      const detail = error.stderr || error.code || String(err);
      throw new Error(`vitest process failed in ${taskDir}: ${detail}`, { cause: err });
    }
  }

  /**
   * Run ESLint on task-c and return JSON output
   */
  private async runLint(task: string): Promise<string> {
    if (task !== "task-c") return "";
    const taskDir = resolve(this.options.tasks_dir, TASK_DIRS[task] ?? task);
    try {
      const { stdout } = await execFileAsync("npx", ["eslint", "src/", "--format", "json"], {
        cwd: taskDir,
        timeout: 60_000,
      });
      return stdout;
    } catch (err: unknown) {
      // ESLint exits with non-zero when lint errors exist, but still outputs JSON
      const error = err as { stdout?: string; stderr?: string; code?: string | number };
      if (error.stdout && error.stdout.trimStart().startsWith("[")) {
        return error.stdout;
      }
      const detail = error.stderr || error.code || String(err);
      throw new Error(`ESLint process failed in ${taskDir}: ${detail}`, { cause: err });
    }
  }

  /**
   * Execute a single run: reset → session → evaluate → collect metrics
   */
  async executeRun(spec: RunSpec): Promise<RunResult> {
    const startTime = Date.now();

    try {
      // 1. Reset task codebase
      await this.orchestrator.resetTask(spec.task);

      // 2. Execute Claude session
      const sessionResult = await this.orchestrator.executeSession(spec);
      if (sessionResult.exit_code !== 0) {
        throw new Error(
          `Claude session failed (exit ${sessionResult.exit_code}): ${sessionResult.stderr.slice(0, 500)}`
        );
      }

      // 3. Run tests / lint to evaluate
      const vitestOutput = await this.runTaskTests(spec.task);
      const eslintOutput = spec.task === "task-c" ? await this.runLint(spec.task) : undefined;

      // 4. Evaluate results
      const evaluation = this.evaluator.evaluate(spec.task, {
        vitest: vitestOutput || undefined,
        eslint: eslintOutput,
      });

      // 5. Collect metrics
      const metrics = this.collector.collect({
        run_id: spec.run_id,
        condition: spec.condition,
        task: spec.task,
        context_size: spec.context_size,
        session_number: spec.session_number,
        completion_rate: evaluation.completion_rate,
      });

      return {
        spec,
        metrics,
        duration_ms: Date.now() - startTime,
      };
    } catch (err) {
      // Collect error result
      const metrics = this.collector.collect({
        run_id: spec.run_id,
        condition: spec.condition,
        task: spec.task,
        context_size: spec.context_size,
        session_number: spec.session_number,
        completion_rate: 0,
      });

      return {
        spec,
        metrics,
        duration_ms: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Run the full experiment for a given filter
   */
  async run(filter: MilestoneFilter, experimentId?: string): Promise<void> {
    const id = experimentId ?? `exp_${Date.now()}`;
    const specs = RunMatrix.generate(filter);

    console.log(`Starting experiment ${id}: ${specs.length} runs`);

    const results: RunResult[] = [];

    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      console.log(`[${i + 1}/${specs.length}] Running: ${spec.run_id}`);

      const result = await this.executeRun(spec);
      results.push(result);

      if (result.error) {
        console.log(`  ERROR: ${result.error}`);
      } else {
        console.log(
          `  Completion: ${result.metrics.task_completion_rate} | Duration: ${result.duration_ms}ms`
        );
      }
    }

    // Generate report
    const report = this.reportGenerator.generateReport(id, results);

    // Save results
    mkdirSync(this.options.results_dir, { recursive: true });
    const jsonPath = resolve(this.options.results_dir, `${id}.json`);
    const csvPath = resolve(this.options.results_dir, `${id}.csv`);

    try {
      writeFileSync(jsonPath, this.reportGenerator.exportJSON(report));
      writeFileSync(csvPath, this.reportGenerator.exportCSV(results));
    } catch (writeErr) {
      console.error(`Failed to write results to disk: ${writeErr}`);
      console.error("Dumping JSON results to stdout as fallback:");
      console.log(this.reportGenerator.exportJSON(report));
      throw writeErr;
    }

    console.log(`\nExperiment complete. Results saved to:`);
    console.log(`  JSON: ${jsonPath}`);
    console.log(`  CSV: ${csvPath}`);

    // Print summary
    console.log(`\nAggregated Results:`);
    for (const agg of report.aggregated) {
      console.log(
        `  ${agg.condition}: mean_completion=${agg.mean_completion_rate.toFixed(3)} (±${agg.std_completion_rate.toFixed(3)}), n=${agg.run_count}`
      );
    }
  }
}
