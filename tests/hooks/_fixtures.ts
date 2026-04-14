/**
 * Shared test fixtures for hook tests.
 * Provides transcript line builders, environment setup, and transcript file helpers.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** Create a transcript JSONL line for a real user message */
export function userLine(text: string, opts: { promptId?: string; uuid?: string } = {}): string {
  return JSON.stringify({
    type: "user",
    timestamp: new Date().toISOString(),
    uuid: opts.uuid ?? crypto.randomUUID(),
    parentUuid: null,
    permissionMode: "default",
    promptId: opts.promptId ?? crypto.randomUUID(),
    message: { role: "user", content: text },
  });
}

/** Create a transcript JSONL line for an interrupt */
export function interruptLine(): string {
  return JSON.stringify({
    type: "user",
    timestamp: new Date().toISOString(),
    uuid: crypto.randomUUID(),
    parentUuid: null,
    message: { role: "user", content: "[Request interrupted by user]" },
  });
}

/** Create a transcript JSONL line for an assistant response */
export function assistantLine(text: string): string {
  return JSON.stringify({
    type: "assistant",
    timestamp: new Date().toISOString(),
    uuid: crypto.randomUUID(),
    message: { role: "assistant", content: text },
  });
}

/**
 * Create a temp directory, config file, and set ACM_CONFIG_PATH.
 * Returns the db path for verification.
 */
export function setupEnv(tmpDir: string, mode: string = "full"): string {
  mkdirSync(tmpDir, { recursive: true });
  const dbPath = join(tmpDir, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const configPath = join(
    tmpDir,
    `config-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  writeFileSync(
    configPath,
    JSON.stringify({
      mode,
      db_path: dbPath,
      promotion_threshold: 0.1,
    })
  );
  process.env.ACM_CONFIG_PATH = configPath;
  return dbPath;
}

export function cleanupEnv(): void {
  delete process.env.ACM_CONFIG_PATH;
}

/** Write transcript lines to a unique JSONL file, return the path */
export function writeTranscript(tmpDir: string, lines: string[]): string {
  const path = join(
    tmpDir,
    `transcript-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`
  );
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

/** Create a standard temp directory path for a given test suite */
export function makeTmpDir(suiteName: string): string {
  return join(tmpdir(), `acm-test-${suiteName}`);
}
