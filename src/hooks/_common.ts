/**
 * Common bootstrap module for ACM hooks
 * Issue #37: feat(hooks): common bootstrap module for ACM hooks
 *
 * Each hook script calls bootstrapHook() with raw stdin.
 * Returns null for silent exit (ACM not configured or disabled).
 * Returns initialized stores + parsed input for active hooks.
 */

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
  cleanup: () => void;
}

export function bootstrapHook(stdin: string): HookContext | null {
  // Check ACM_CONFIG_PATH
  const configPath = process.env.ACM_CONFIG_PATH;
  if (!configPath) {
    return null;
  }

  // Load config
  const config = loadConfig(configPath);
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

    return {
      input,
      config,
      signalStore,
      experienceStore,
      collector,
      cleanup: () => {
        db.close();
      },
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Shared entry point for hook scripts.
 * Reads stdin, calls handler, handles errors.
 * Supports both sync and async handlers.
 */
export function runAsHookScript(
  handler: (stdin: string) => void | Promise<void>,
  hookName: string
): void {
  let stdin = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk) => {
    stdin += chunk;
  });
  process.stdin.on("end", () => {
    Promise.resolve(handler(stdin)).catch((err) => {
      const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
      console.error(`[ACM hook error] ${hookName}: ${message}`);
      process.exit(1);
    });
  });
}
