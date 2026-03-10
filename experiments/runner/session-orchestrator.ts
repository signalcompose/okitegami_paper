import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { RunSpec } from "../harness/types.js";
import { TASK_DIRS, CONDITION_CONFIGS } from "./types.js";
import {
  createWorktree,
  cleanupWorktree,
  generateHooksConfig,
  readSessionSignals,
} from "./worktree-helpers.js";
import type { SignalData } from "../harness/metric-collector.js";

const execFileAsync = promisify(execFile);

export interface SessionResult {
  run_id: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}

export interface OrchestratorOptions {
  tasks_dir: string; // Path to experiments/tasks/
  config_dir: string; // Path to experiments/config/
  project_root?: string; // Project root for worktree operations
  dry_run?: boolean; // If true, skip actual Claude session
  timeout_ms?: number; // Session timeout (default 10 minutes)
}

export class SessionOrchestrator {
  private options: Required<OrchestratorOptions>;

  constructor(options: OrchestratorOptions) {
    this.options = {
      tasks_dir: options.tasks_dir,
      config_dir: options.config_dir,
      project_root: options.project_root ?? process.cwd(),
      dry_run: options.dry_run ?? false,
      timeout_ms: options.timeout_ms ?? 600_000, // 10 min
    };
  }

  /**
   * Create a git worktree for isolated experiment run
   */
  async createWorktree(runId: string): Promise<string> {
    if (this.options.dry_run) {
      const path = `/tmp/acm_exp_${runId}`;
      console.log(`[DRY RUN] Would create worktree: ${path}`);
      return path;
    }
    return createWorktree(this.options.project_root, runId);
  }

  /**
   * Remove a git worktree after experiment run
   */
  async cleanupWorktree(runId: string): Promise<void> {
    if (this.options.dry_run) {
      console.log(`[DRY RUN] Would cleanup worktree: /tmp/acm_exp_${runId}`);
      return;
    }
    return cleanupWorktree(this.options.project_root, runId);
  }

  /**
   * Generate hooks config in worktree for ACM integration
   */
  setupHooksInWorktree(worktreePath: string): void {
    if (this.options.dry_run) {
      console.log(`[DRY RUN] Would setup hooks in: ${worktreePath}`);
      return;
    }
    generateHooksConfig(worktreePath, this.options.project_root);
  }

  /**
   * Read session signal counts from worktree DB
   */
  readSignals(dbPath: string, sessionId: string): SignalData {
    return readSessionSignals(dbPath, sessionId);
  }

  /**
   * Reset task to initial state by running reset.sh
   */
  async resetTask(task: string): Promise<void> {
    const taskDir = resolve(this.options.tasks_dir, TASK_DIRS[task] ?? task);
    const resetScript = resolve(taskDir, "reset.sh");

    if (this.options.dry_run) {
      console.log(`[DRY RUN] Would reset: ${resetScript}`);
      return;
    }

    try {
      await execFileAsync("bash", [resetScript], { cwd: taskDir });
    } catch (err) {
      throw new Error(
        `Failed to reset task ${task}: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
    }
  }

  /**
   * Execute a single Claude Code session for a RunSpec
   */
  async executeSession(spec: RunSpec): Promise<SessionResult> {
    const taskDir = resolve(this.options.tasks_dir, TASK_DIRS[spec.task] ?? spec.task);
    const configPath = resolve(
      this.options.config_dir,
      CONDITION_CONFIGS[spec.condition] ?? `${spec.condition}.json`
    );
    const startTime = Date.now();

    if (this.options.dry_run) {
      console.log(`[DRY RUN] Would execute session: ${spec.run_id}`);
      console.log(`  Task dir: ${taskDir}`);
      console.log(`  Config: ${configPath}`);
      console.log(`  Condition: ${spec.condition}`);
      console.log(`  Context size: ${spec.context_size}`);
      return {
        run_id: spec.run_id,
        stdout: "[DRY RUN] No output",
        stderr: "",
        exit_code: 0,
        duration_ms: Date.now() - startTime,
      };
    }

    // Read TASK.md as the prompt for Claude
    const { readFileSync } = await import("node:fs");
    let taskMd: string;
    try {
      taskMd = readFileSync(resolve(taskDir, "TASK.md"), "utf-8");
    } catch (err) {
      throw new Error(
        `Cannot read TASK.md in ${taskDir} — ensure the task directory contains a TASK.md file`,
        { cause: err }
      );
    }

    try {
      // Execute claude CLI in --print mode (non-interactive)
      const { stdout, stderr } = await execFileAsync(
        "claude",
        ["--print", `--cwd`, taskDir, taskMd],
        {
          cwd: taskDir,
          timeout: this.options.timeout_ms,
          env: {
            ...process.env,
            ACM_CONFIG_PATH: configPath,
          },
        }
      );

      return {
        run_id: spec.run_id,
        stdout,
        stderr,
        exit_code: 0,
        duration_ms: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; code?: number };
      return {
        run_id: spec.run_id,
        stdout: error.stdout ?? "",
        stderr: error.stderr ?? String(err),
        exit_code: error.code ?? 1,
        duration_ms: Date.now() - startTime,
      };
    }
  }
}
