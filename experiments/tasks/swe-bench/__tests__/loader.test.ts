import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSweBenchTasks, loadSubset, sweBenchTaskSchema } from "../loader.js";

const FIXTURES_DIR = join(__dirname, "..", "fixtures");

describe("sweBenchTaskSchema", () => {
  const valid = {
    instance_id: "repo__id-1",
    repo: "owner/repo",
    base_commit: "abc123",
    problem_statement: "Fix bug",
    patch: "diff ...",
    test_patch: "diff ...",
    FAIL_TO_PASS: ["test.a"],
    PASS_TO_PASS: ["test.b"],
  };

  it("accepts a valid task", () => {
    const parsed = sweBenchTaskSchema.parse(valid);
    expect(parsed.instance_id).toBe("repo__id-1");
    expect(parsed.FAIL_TO_PASS).toEqual(["test.a"]);
  });

  it("accepts task with empty test_patch", () => {
    const parsed = sweBenchTaskSchema.parse({ ...valid, test_patch: "" });
    expect(parsed.test_patch).toBe("");
  });

  it("accepts task with empty PASS_TO_PASS", () => {
    const parsed = sweBenchTaskSchema.parse({ ...valid, PASS_TO_PASS: [] });
    expect(parsed.PASS_TO_PASS).toEqual([]);
  });

  it("rejects missing instance_id", () => {
    const { instance_id: _unused, ...rest } = valid;
    void _unused;
    expect(() => sweBenchTaskSchema.parse(rest)).toThrow();
  });

  it("rejects missing FAIL_TO_PASS", () => {
    const { FAIL_TO_PASS: _unused, ...rest } = valid;
    void _unused;
    expect(() => sweBenchTaskSchema.parse(rest)).toThrow();
  });

  it("rejects non-string instance_id", () => {
    expect(() => sweBenchTaskSchema.parse({ ...valid, instance_id: 123 })).toThrow();
  });

  it("rejects empty patch", () => {
    expect(() => sweBenchTaskSchema.parse({ ...valid, patch: "" })).toThrow();
  });
});

describe("loadSweBenchTasks", () => {
  it("loads JSON Lines format", () => {
    const tasks = loadSweBenchTasks(join(FIXTURES_DIR, "sample.jsonl"));
    expect(tasks).toHaveLength(2);
    expect(tasks[0].instance_id).toBe("django__django-11001");
    expect(tasks[0].repo).toBe("django/django");
    expect(tasks[1].instance_id).toBe("sympy__sympy-20212");
  });

  it("loads JSON array format", () => {
    const tasks = loadSweBenchTasks(join(FIXTURES_DIR, "sample-array.json"));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].repo).toBe("pallets/flask");
  });

  describe("with temporary files", () => {
    const testDir = join(tmpdir(), `swe-bench-loader-test-${Date.now()}`);

    beforeEach(() => {
      mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it("throws on non-existent file", () => {
      expect(() => loadSweBenchTasks(join(testDir, "missing.jsonl"))).toThrow();
    });

    it("throws on empty file", () => {
      const p = join(testDir, "empty.jsonl");
      writeFileSync(p, "");
      expect(() => loadSweBenchTasks(p)).toThrow(/empty|no tasks/i);
    });

    it("throws on malformed JSON line", () => {
      const p = join(testDir, "bad.jsonl");
      writeFileSync(p, '{"instance_id":"x"\n');
      expect(() => loadSweBenchTasks(p)).toThrow();
    });

    it("throws when required field missing", () => {
      const p = join(testDir, "incomplete.jsonl");
      writeFileSync(p, JSON.stringify({ instance_id: "x" }) + "\n");
      expect(() => loadSweBenchTasks(p)).toThrow();
    });

    it("skips blank lines in JSONL", () => {
      const p = join(testDir, "blanks.jsonl");
      const task = {
        instance_id: "a__b-1",
        repo: "a/b",
        base_commit: "c1",
        problem_statement: "p",
        patch: "d",
        test_patch: "",
        FAIL_TO_PASS: ["t1"],
        PASS_TO_PASS: [],
      };
      writeFileSync(p, `\n${JSON.stringify(task)}\n\n`);
      const tasks = loadSweBenchTasks(p);
      expect(tasks).toHaveLength(1);
    });
  });
});

describe("loadSubset", () => {
  const mkTask = (id: string) => ({
    instance_id: id,
    repo: "a/b",
    base_commit: "c",
    problem_statement: "p",
    patch: "d",
    test_patch: "",
    FAIL_TO_PASS: ["t"],
    PASS_TO_PASS: [],
  });

  it("takes first n tasks when given a count", () => {
    const tasks = [mkTask("a"), mkTask("b"), mkTask("c")];
    const subset = loadSubset(tasks, 2);
    expect(subset).toHaveLength(2);
    expect(subset[0].instance_id).toBe("a");
    expect(subset[1].instance_id).toBe("b");
  });

  it("returns all tasks when n exceeds length", () => {
    const tasks = [mkTask("a")];
    expect(loadSubset(tasks, 10)).toHaveLength(1);
  });

  it("filters by instance_id list", () => {
    const tasks = [mkTask("a"), mkTask("b"), mkTask("c")];
    const subset = loadSubset(tasks, ["b", "c"]);
    expect(subset).toHaveLength(2);
    expect(subset.map((t) => t.instance_id)).toEqual(["b", "c"]);
  });

  it("preserves order from the source when filtering by id list", () => {
    const tasks = [mkTask("a"), mkTask("b"), mkTask("c")];
    const subset = loadSubset(tasks, ["c", "a"]);
    expect(subset.map((t) => t.instance_id)).toEqual(["a", "c"]);
  });

  it("returns empty array when no ids match", () => {
    const tasks = [mkTask("a")];
    expect(loadSubset(tasks, ["z"])).toEqual([]);
  });

  it("throws on non-positive count", () => {
    expect(() => loadSubset([mkTask("a")], -1)).toThrow();
    expect(() => loadSubset([mkTask("a")], 0)).toThrow();
  });
});
