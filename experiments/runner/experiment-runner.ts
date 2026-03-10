/**
 * ExperimentRunner — Hook-free experiment execution with prompt-level experience injection.
 *
 * Flow per run:
 *   1. Create worktree for isolation
 *   2. Symlink node_modules
 *   3. Reset task codebase
 *   4. [ACM] Retrieve past experiences → format injection text
 *   5. Execute Claude session (with injection text prepended to TASK.md)
 *   6. Run tests → evaluate completion_rate
 *   7. [ACM] Generate experience → store in shared DB
 *   8. Collect metrics
 *   9. Cleanup worktree
 */

import { RunSpec, RunResult } from "../harness/types.js";
import { TaskEvaluator } from "../harness/task-evaluator.js";
import { MetricCollector } from "../harness/metric-collector.js";
import { ReportGenerator } from "../harness/report-generator.js";
import { SessionOrchestrator, OrchestratorOptions } from "./session-orchestrator.js";
import { ExperienceManager } from "./experience-manager.js";
import { RunMatrix } from "./run-matrix.js";
import { MilestoneFilter, TASK_DIRS } from "./types.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

const execFileAsync = promisify(execFile);

export interface ExperimentOptions extends OrchestratorOptions {
  results_dir: string;
}

export class ExperimentRunner {
  private orchestrator: SessionOrchestrator;
  private evaluator: TaskEvaluator;
  private collector: MetricCollector;
  private reportGenerator: ReportGenerator;
  private experienceManager: ExperienceManager;
  private options: ExperimentOptions;

  constructor(options: ExperimentOptions) {
    this.options = options;
    this.orchestrator = new SessionOrchestrator(options);
    this.evaluator = new TaskEvaluator();
    this.collector = new MetricCollector();
    this.reportGenerator = new ReportGenerator();
    this.experienceManager = new ExperienceManager(options.results_dir);
  }

  private async runTaskTests(task: string, worktreePath?: string): Promise<string> {
    const taskDirName = TASK_DIRS[task] ?? task;
    const taskDir = worktreePath
      ? resolve(worktreePath, "experiments", "tasks", taskDirName)
      : resolve(this.options.tasks_dir, taskDirName);
    try {
      const { stdout } = await execFileAsync("npx", ["vitest", "run", "--reporter=json"], {
        cwd: taskDir,
        timeout: 60_000,
      });
      return stdout;
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; code?: string | number };
      if (error.stdout && error.stdout.includes('"numTotalTests"')) {
        return error.stdout;
      }
      const detail = error.stderr || error.code || String(err);
      throw new Error(`vitest process failed in ${taskDir}: ${detail}`, { cause: err });
    }
  }

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
      const error = err as { stdout?: string; stderr?: string; code?: string | number };
      if (error.stdout && error.stdout.trimStart().startsWith("[")) {
        return error.stdout;
      }
      const detail = error.stderr || error.code || String(err);
      throw new Error(`ESLint process failed in ${taskDir}: ${detail}`, { cause: err });
    }
  }

  /**
   * Read task description for experience generation / retrieval
   */
  private readTaskDescription(task: string): string {
    const taskDir = resolve(this.options.tasks_dir, TASK_DIRS[task] ?? task);
    try {
      return readFileSync(resolve(taskDir, "TASK.md"), "utf-8");
    } catch {
      return task;
    }
  }

  /**
   * Execute a single run with hook-free experience lifecycle.
   */
  async executeRun(spec: RunSpec, experimentId: string): Promise<RunResult> {
    const startTime = Date.now();
    let worktreePath: string | null = null;
    const dbPath = this.experienceManager.getDbPath(
      experimentId,
      spec.condition,
      spec.task,
      spec.context_size
    );

    try {
      // 1. Create isolated worktree
      worktreePath = await this.orchestrator.createWorktree(spec.run_id);

      // 2. Symlink node_modules (no hooks setup needed)
      this.orchestrator.setupWorktreeNodeModules(worktreePath, spec.task);

      // 3. Reset task codebase in worktree
      await this.orchestrator.resetTask(spec.task, worktreePath ?? undefined);

      // 4. Retrieve past experiences for ACM conditions
      const taskDescription = this.readTaskDescription(spec.task);
      const injectionText = this.experienceManager.retrieveInjection(
        dbPath,
        taskDescription,
        spec.condition
      );

      if (injectionText) {
        console.log(`  [ACM] Injecting ${injectionText.length} chars of past experience`);
      }

      // 5. Execute Claude session
      const sessionResult = await this.orchestrator.executeSession(spec, {
        worktreePath,
        injectionText: injectionText || undefined,
      });

      if (sessionResult.exit_code !== 0) {
        throw new Error(
          `Claude session failed (exit ${sessionResult.exit_code}): ${sessionResult.stderr.slice(0, 500)}`
        );
      }

      // 6. Run tests to evaluate (skip in dry-run — worktree doesn't exist)
      let completionRate = 0;
      if (this.options.dry_run) {
        completionRate = 1.0; // Simulated result for dry-run
      } else {
        const vitestOutput = await this.runTaskTests(spec.task, worktreePath);
        const eslintOutput = spec.task === "task-c" ? await this.runLint(spec.task) : undefined;
        const evaluation = this.evaluator.evaluate(spec.task, {
          vitest: vitestOutput || undefined,
          eslint: eslintOutput,
        });
        completionRate = evaluation.completion_rate;
      }

      // 8. Generate and store experience for ACM conditions
      if (spec.condition !== "control" && spec.condition !== "baseline-compact") {
        const experience = this.experienceManager.generateExperience({
          sessionId: spec.run_id,
          completionRate,
          taskDescription,
          claudeOutput: sessionResult.stdout.slice(0, 500),
        });
        if (experience) {
          this.experienceManager.storeExperience(dbPath, experience);
          console.log(
            `  [ACM] Stored ${experience.type} experience (strength: ${experience.signal_strength.toFixed(2)})`
          );
        }
      }

      // 9. Collect metrics (no signal data in hook-free mode)
      const metrics = this.collector.collect({
        run_id: spec.run_id,
        condition: spec.condition,
        task: spec.task,
        context_size: spec.context_size,
        session_number: spec.session_number,
        completion_rate: completionRate,
      });

      return {
        spec,
        metrics,
        duration_ms: Date.now() - startTime,
      };
    } catch (err) {
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
    } finally {
      if (worktreePath) {
        try {
          await this.orchestrator.cleanupWorktree(spec.run_id);
        } catch (cleanupErr) {
          const msg =
            cleanupErr instanceof Error
              ? (cleanupErr.stack ?? cleanupErr.message)
              : String(cleanupErr);
          console.warn(`[ACM] Failed to cleanup worktree for ${spec.run_id}: ${msg}`);
        }
      }
    }
  }

  /**
   * Run the full experiment for a given filter.
   */
  async run(filter: MilestoneFilter, experimentId?: string): Promise<void> {
    const id = experimentId ?? `exp_${Date.now()}`;
    const specs = RunMatrix.generate(filter);

    console.log(`Starting experiment ${id}: ${specs.length} runs`);

    const results: RunResult[] = [];

    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      console.log(`[${i + 1}/${specs.length}] Running: ${spec.run_id}`);

      const result = await this.executeRun(spec, id);
      results.push(result);

      if (result.error) {
        console.log(`  ERROR: ${result.error}`);
      } else {
        console.log(
          `  Completion: ${result.metrics.task_completion_rate} | Duration: ${result.duration_ms}ms`
        );
      }
    }

    // Close all experience DBs
    this.experienceManager.closeAll();

    // Generate report
    const report = this.reportGenerator.generateReport(id, results);

    // Save results
    const expDir = resolve(this.options.results_dir, id);
    mkdirSync(expDir, { recursive: true });
    const jsonPath = resolve(expDir, `${id}.json`);
    const csvPath = resolve(expDir, `${id}.csv`);

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
