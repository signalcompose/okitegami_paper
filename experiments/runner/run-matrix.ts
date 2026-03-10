import { RunSpec } from "../harness/types.js";
import { MilestoneFilter } from "./types.js";

export class RunMatrix {
  /**
   * Generate RunSpecs for all combinations of conditions × tasks × context_sizes × sessions
   */
  static generate(filter: MilestoneFilter): RunSpec[] {
    const specs: RunSpec[] = [];

    for (const condition of filter.conditions) {
      for (const task of filter.tasks) {
        for (const context_size of filter.context_sizes) {
          for (let session = 1; session <= filter.sessions; session++) {
            specs.push({
              condition,
              task,
              context_size,
              session_number: session,
              run_id: `${condition}_${task}_${context_size}_s${session}`,
            });
          }
        }
      }
    }

    return specs;
  }
}
