import { describe, it, expect } from "vitest";
import { RunMatrix } from "../../experiments/runner/run-matrix.js";
import { MILESTONE_6A, FULL_EXPERIMENT } from "../../experiments/runner/types.js";

describe("RunMatrix", () => {
  describe("generate", () => {
    it("generates full experiment matrix: 5×3×3×5 = 225 RunSpecs", () => {
      const specs = RunMatrix.generate(FULL_EXPERIMENT);
      expect(specs).toHaveLength(225);
    });

    it("generates milestone 6-A matrix: 2×1×1×5 = 10 RunSpecs", () => {
      const specs = RunMatrix.generate(MILESTONE_6A);
      expect(specs).toHaveLength(10);
    });

    it("each RunSpec has a unique run_id", () => {
      const specs = RunMatrix.generate(FULL_EXPERIMENT);
      const ids = new Set(specs.map((s) => s.run_id));
      expect(ids.size).toBe(225);
    });

    it("milestone 6-A contains only control and acm-sf conditions", () => {
      const specs = RunMatrix.generate(MILESTONE_6A);
      const conditions = new Set(specs.map((s) => s.condition));
      expect(conditions).toEqual(new Set(["control", "acm-sf"]));
    });

    it("milestone 6-A contains only task-a", () => {
      const specs = RunMatrix.generate(MILESTONE_6A);
      const tasks = new Set(specs.map((s) => s.task));
      expect(tasks).toEqual(new Set(["task-a"]));
    });

    it("milestone 6-A contains only full context size", () => {
      const specs = RunMatrix.generate(MILESTONE_6A);
      const sizes = new Set(specs.map((s) => s.context_size));
      expect(sizes).toEqual(new Set(["full"]));
    });

    it("session numbers range from 1 to sessions count", () => {
      const specs = RunMatrix.generate(MILESTONE_6A);
      const sessions = [...new Set(specs.map((s) => s.session_number))].sort();
      expect(sessions).toEqual([1, 2, 3, 4, 5]);
    });

    it("run_id format includes condition, task, context, session", () => {
      const specs = RunMatrix.generate(MILESTONE_6A);
      const first = specs[0];
      expect(first.run_id).toContain(first.condition);
      expect(first.run_id).toContain(first.task);
    });

    it("generates custom filter", () => {
      const specs = RunMatrix.generate({
        conditions: ["acm-s"],
        tasks: ["task-b", "task-c"],
        context_sizes: ["full"],
        sessions: 2,
      });
      expect(specs).toHaveLength(4); // 1×2×1×2
    });
  });
});
