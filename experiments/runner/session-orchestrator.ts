import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { resolve, join } from "node:path";
import { readFileSync, symlinkSync, existsSync } from "node:fs";
import { RunSpec } from "../harness/types.js";
import { TASK_DIRS, CONDITION_CONFIGS } from "./types.js";
import { createWorktree, cleanupWorktree } from "./worktree-helpers.js";

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
   * Reset task to initial state by running reset.sh
   */
  async resetTask(task: string, worktreePath?: string): Promise<void> {
    const taskDirName = TASK_DIRS[task] ?? task;
    const taskDir = worktreePath
      ? resolve(worktreePath, "experiments", "tasks", taskDirName)
      : resolve(this.options.tasks_dir, taskDirName);
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
   * Symlink node_modules into the worktree so claude can run tests.
   * Links both root node_modules (for tsx) and task-level node_modules (for vitest).
   */
  setupWorktreeNodeModules(worktreePath: string, task: string): void {
    if (this.options.dry_run) {
      console.log(`[DRY RUN] Would symlink node_modules in: ${worktreePath}`);
      return;
    }
    const safeSymlink = (target: string, linkPath: string, label: string) => {
      if (existsSync(linkPath) || !existsSync(target)) return;
      try {
        symlinkSync(target, linkPath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EEXIST") return;
        throw new Error(
          `Failed to symlink ${label} into worktree at ${linkPath}: ${(err as Error).message}`,
          { cause: err }
        );
      }
    };

    const rootNm = join(this.options.project_root, "node_modules");
    const wtRootNm = join(worktreePath, "node_modules");
    safeSymlink(rootNm, wtRootNm, "root node_modules");

    const taskDirName = TASK_DIRS[task] ?? task;
    const taskNm = join(
      this.options.project_root,
      "experiments",
      "tasks",
      taskDirName,
      "node_modules"
    );
    const wtTaskNm = join(worktreePath, "experiments", "tasks", taskDirName, "node_modules");
    safeSymlink(taskNm, wtTaskNm, "task node_modules");
  }

  /**
   * Execute a single Claude Code session for a RunSpec.
   * Uses --print mode with spawn (prompt piped via stdin; EOF signals end of input).
   * injectionText is prepended to the TASK.md prompt for ACM conditions.
   */
  async executeSession(
    spec: RunSpec,
    options?: { worktreePath?: string; injectionText?: string }
  ): Promise<SessionResult> {
    const mainTaskDir = resolve(this.options.tasks_dir, TASK_DIRS[spec.task] ?? spec.task);
    const startTime = Date.now();

    if (this.options.dry_run) {
      const configPath = resolve(
        this.options.config_dir,
        CONDITION_CONFIGS[spec.condition] ?? `${spec.condition}.json`
      );
      console.log(`[DRY RUN] Would execute session: ${spec.run_id}`);
      console.log(`  Task dir: ${mainTaskDir}`);
      console.log(`  Config: ${configPath}`);
      console.log(`  Condition: ${spec.condition}`);
      console.log(`  Context size: ${spec.context_size}`);
      if (options?.injectionText) {
        console.log(`  Injection: ${options.injectionText.slice(0, 100)}...`);
      }
      return {
        run_id: spec.run_id,
        stdout: "[DRY RUN] No output",
        stderr: "",
        exit_code: 0,
        duration_ms: Date.now() - startTime,
      };
    }

    // Determine working directory
    const taskDirName = TASK_DIRS[spec.task] ?? spec.task;
    const cwd = options?.worktreePath
      ? join(options.worktreePath, "experiments", "tasks", taskDirName)
      : mainTaskDir;

    // Read TASK.md
    let taskMd: string;
    try {
      taskMd = readFileSync(resolve(cwd, "TASK.md"), "utf-8");
    } catch (err) {
      throw new Error(
        `Cannot read TASK.md in ${cwd} — ensure the task directory contains a TASK.md file`,
        { cause: err }
      );
    }

    // Prepend ACM experience injection if available
    if (options?.injectionText) {
      taskMd = `${options.injectionText}\n\n---\n\n${taskMd}`;
    }

    // Build env without CLAUDECODE to allow spawning claude from within a session
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const SIGNAL_NUMBERS: Record<string, number> = {
      SIGHUP: 1,
      SIGINT: 2,
      SIGQUIT: 3,
      SIGTERM: 15,
      SIGKILL: 9,
    };

    // Pipe taskMd via stdin to avoid CLI argument injection issues
    return new Promise<SessionResult>((resolvePromise) => {
      let resolved = false;
      const finish = (result: SessionResult) => {
        if (resolved) return;
        resolved = true;
        resolvePromise(result);
      };

      let stdout = "";
      let stderr = "";

      const child = spawn("claude", ["--print", "-"], {
        cwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Handle stdin errors (EPIPE is normal if child exits before reading all input)
      child.stdin.on("error", (err) => {
        if ((err as NodeJS.ErrnoException).code !== "EPIPE") {
          stderr += `stdin write error: ${err.message}\n`;
        }
      });

      // Write prompt via stdin and close to signal EOF
      child.stdin.write(taskMd);
      child.stdin.end();

      child.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      let sigkillTimer: ReturnType<typeof setTimeout> | undefined;

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        // Follow up with SIGKILL if SIGTERM is ignored
        sigkillTimer = setTimeout(() => {
          child.kill("SIGKILL");
        }, 5_000);
      }, this.options.timeout_ms);

      child.on("error", (err) => {
        clearTimeout(timer);
        clearTimeout(sigkillTimer);
        finish({
          run_id: spec.run_id,
          stdout,
          stderr: `spawn error: ${err.message}`,
          exit_code: 1,
          duration_ms: Date.now() - startTime,
        });
      });

      child.on("close", (code, signal) => {
        clearTimeout(timer);
        clearTimeout(sigkillTimer);
        finish({
          run_id: spec.run_id,
          stdout,
          stderr,
          exit_code: signal ? 128 + (SIGNAL_NUMBERS[signal] ?? 0) : (code ?? 1),
          duration_ms: Date.now() - startTime,
        });
      });
    });
  }
}
