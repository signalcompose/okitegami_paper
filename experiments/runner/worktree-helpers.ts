/**
 * Worktree-based run isolation helpers
 * Issues #42, #43: worktree creation, hook config generation, signal reading
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SignalData } from "../harness/metric-collector.js";

const execFileAsync = promisify(execFile);

/**
 * Create a git worktree for an experiment run.
 * Returns the worktree path.
 */
export async function createWorktree(
  repoRoot: string,
  runId: string,
  basePath: string = "/tmp"
): Promise<string> {
  if (!/^[\w-]+$/.test(runId)) {
    throw new Error(`Invalid runId "${runId}": must contain only word characters and hyphens`);
  }
  const worktreePath = join(basePath, `acm_exp_${runId}`);

  await execFileAsync("git", ["worktree", "add", "--detach", worktreePath, "HEAD"], {
    cwd: repoRoot,
  });

  return worktreePath;
}

/**
 * Remove a git worktree.
 */
export async function cleanupWorktree(
  repoRoot: string,
  runId: string,
  basePath: string = "/tmp"
): Promise<void> {
  const worktreePath = join(basePath, `acm_exp_${runId}`);

  await execFileAsync("git", ["worktree", "remove", "--force", worktreePath], {
    cwd: repoRoot,
  });
}

/**
 * Generate .claude/settings.local.json in the worktree with hook registrations.
 * Hooks use tsx with absolute paths to the project root's hook scripts.
 */
export function generateHooksConfig(worktreePath: string, projectRoot: string): void {
  const claudeDir = join(worktreePath, ".claude");
  mkdirSync(claudeDir, { recursive: true });

  const tsxPath = join(projectRoot, "node_modules", ".bin", "tsx");
  const hooksDir = join(projectRoot, "src", "hooks");

  const hookScripts: Record<string, string> = {
    SessionStart: "session-start.ts",
    PostToolUseFailure: "post-tool-use-failure.ts",
    UserPromptSubmit: "user-prompt-submit.ts",
    PostToolUse: "post-tool-use.ts",
    Stop: "stop.ts",
  };

  const hooks: Record<string, Array<{ command: string; timeout?: number }>> = {};

  for (const [event, script] of Object.entries(hookScripts)) {
    const scriptPath = join(hooksDir, script);
    hooks[event] = [
      {
        command: `"${tsxPath}" "${scriptPath}"`,
        timeout: event === "SessionStart" ? 30000 : 10000,
      },
    ];
  }

  // Add SessionEnd (separate from Stop — runs after session completes)
  hooks["SessionEnd"] = [
    {
      command: `"${tsxPath}" "${join(hooksDir, "session-end.ts")}"`,
      timeout: 30000,
    },
  ];

  const settings = { hooks };
  writeFileSync(join(claudeDir, "settings.local.json"), JSON.stringify(settings, null, 2));
}

/**
 * Read signal counts from a session's DB.
 * Returns zeros if DB doesn't exist or session has no signals.
 */
export function readSessionSignals(dbPath: string, sessionId: string): SignalData {
  const defaultResult: SignalData = {
    interrupt_count: 0,
    corrective_instruction_count: 0,
  };

  if (!existsSync(dbPath)) {
    return defaultResult;
  }

  try {
    // Dynamic import to avoid loading better-sqlite3 when not needed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });

    try {
      const rows = db
        .prepare(
          "SELECT event_type, COUNT(*) as count FROM session_signals WHERE session_id = ? AND event_type IN ('interrupt', 'corrective_instruction') GROUP BY event_type"
        )
        .all(sessionId) as Array<{ event_type: string; count: number }>;

      for (const row of rows) {
        if (row.event_type === "interrupt") {
          defaultResult.interrupt_count = row.count;
        } else if (row.event_type === "corrective_instruction") {
          defaultResult.corrective_instruction_count = row.count;
        }
      }
    } finally {
      db.close();
    }
  } catch {
    // If DB read fails, return defaults
  }

  return defaultResult;
}
