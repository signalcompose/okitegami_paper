import { readFileSync } from "node:fs";
import { sweBenchTaskSchema, type SweBenchTask } from "./types.js";

export { sweBenchTaskSchema, type SweBenchTask } from "./types.js";

export function loadSweBenchTasks(path: string): SweBenchTask[] {
  const content = readFileSync(path, "utf-8").trim();
  if (content.length === 0) {
    throw new Error(`SWE-bench task file is empty: ${path}`);
  }

  const raw = content.startsWith("[") ? JSON.parse(content) : parseJsonLines(content);
  if (!Array.isArray(raw)) {
    throw new Error(`Expected an array of tasks in ${path}`);
  }
  if (raw.length === 0) {
    throw new Error(`No tasks found in ${path}`);
  }

  return raw.map((entry, i) => {
    const result = sweBenchTaskSchema.safeParse(entry);
    if (!result.success) {
      throw new Error(`Invalid SWE-bench task at index ${i} in ${path}: ${result.error.message}`);
    }
    return result.data;
  });
}

function parseJsonLines(content: string): unknown[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Malformed JSON at line ${i + 1}: ${msg}`);
      }
    });
}

export function loadSubset(tasks: SweBenchTask[], selector: number | string[]): SweBenchTask[] {
  if (typeof selector === "number") {
    if (selector < 0) {
      throw new Error(`Subset count must be non-negative: ${selector}`);
    }
    return tasks.slice(0, selector);
  }
  const ids = new Set(selector);
  return tasks.filter((t) => ids.has(t.instance_id));
}
