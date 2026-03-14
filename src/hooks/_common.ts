/**
 * Common bootstrap module for ACM hooks
 * Issue #37: feat(hooks): common bootstrap module for ACM hooks
 *
 * Each hook script calls bootstrapHook() with raw stdin.
 * Returns null for silent exit (ACM not configured or disabled).
 * Returns initialized stores + parsed input for active hooks.
 */

import { basename } from "node:path";
import { loadConfig } from "../config.js";
import { initializeDatabase } from "../store/schema.js";
import { SessionSignalStore } from "../signals/session-store.js";
import { ExperienceStore } from "../store/experience-store.js";
import { SignalCollector } from "../signals/signal-collector.js";
import type { AcmConfig } from "../store/types.js";

export interface HookContext {
  input: Record<string, unknown>;
  config: AcmConfig;
  signalStore: SessionSignalStore;
  experienceStore: ExperienceStore;
  collector: SignalCollector;
  projectName: string;
  cleanup: () => void;
}

export function bootstrapHook(stdin: string): HookContext | null {
  // Load config: use ACM_CONFIG_PATH if set, otherwise fall back to DEFAULT_CONFIG
  const config = loadConfig(process.env.ACM_CONFIG_PATH || undefined);
  if (config.mode === "disabled") {
    return null;
  }

  // Parse stdin
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(stdin) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `Invalid JSON in hook stdin: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err }
    );
  }

  // Initialize DB and stores
  const db = initializeDatabase(config.db_path);
  try {
    const signalStore = new SessionSignalStore(db);
    const experienceStore = new ExperienceStore(config);
    const collector = new SignalCollector(signalStore, {
      capture_turns: config.capture_turns,
    });

    const projectName = basename((input.cwd as string) || "") || "unknown";

    return {
      input,
      config,
      signalStore,
      experienceStore,
      collector,
      projectName,
      cleanup: () => {
        experienceStore.close();
        db.close();
      },
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Validate that a required string field exists in hook input.
 * Throws a descriptive error if the field is missing or not a string.
 */
export function requireInputString(
  input: Record<string, unknown>,
  field: string,
  hookName: string
): string {
  const value = input[field];
  if (typeof value !== "string" || !value) {
    throw new Error(
      `${hookName}: missing or invalid "${field}" in input. ` +
        `Got: ${JSON.stringify(value)}. Keys present: ${Object.keys(input).join(", ")}`
    );
  }
  return value;
}

/**
 * Shared entry point for hook scripts.
 * Reads stdin, calls handler, handles errors.
 * Supports both sync and async handlers.
 * Exits with code 0 on success, code 1 on unhandled errors.
 */
export function runAsHookScript(
  handler: (stdin: string) => void | Promise<void>,
  hookName: string
): void {
  let stdin = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("error", (err) => {
    console.error(`[ACM hook error] ${hookName}: stdin error: ${err.message}`);
    process.exit(1);
  });
  process.stdin.on("data", (chunk) => {
    stdin += chunk;
  });
  process.stdin.on("end", () => {
    Promise.resolve(handler(stdin))
      .then(() => {
        process.exit(0);
      })
      .catch((err) => {
        const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
        console.error(`[ACM hook error] ${hookName}: ${message}`);
        process.exit(1);
      });
  });
}
