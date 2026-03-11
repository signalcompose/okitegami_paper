import { resolve } from "node:path";
import { ExperimentRunner } from "./experiment-runner.js";
import {
  MILESTONE_6A,
  MILESTONE_6A_C,
  MILESTONE_6D,
  FULL_EXPERIMENT,
  MilestoneFilter,
} from "./types.js";

function parseArgs(args: string[]): {
  milestone: string;
  dry_run: boolean;
  experiment_id?: string;
} {
  let milestone = "6a";
  let dry_run = false;
  let experiment_id: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--milestone":
        milestone = args[++i] ?? "6a";
        break;
      case "--dry-run":
        dry_run = true;
        break;
      case "--id":
        experiment_id = args[++i];
        break;
      case "--help":
        console.log(`
ACM Experiment Runner

Usage: npx tsx experiments/runner/cli.ts [options]

Options:
  --milestone <6a|6a-c|6d|full>  Experiment milestone (default: 6a)
  --dry-run              Skip actual Claude sessions
  --id <string>          Custom experiment ID
  --help                 Show this help
`);
        process.exit(0);
    }
  }

  return { milestone, dry_run, experiment_id };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const MILESTONE_MAP: Record<string, MilestoneFilter> = {
    "6a": MILESTONE_6A,
    "6a-c": MILESTONE_6A_C,
    "6d": MILESTONE_6D,
    full: FULL_EXPERIMENT,
  };
  const filter = MILESTONE_MAP[args.milestone];
  if (!filter) {
    console.error(
      `Error: unknown milestone "${args.milestone}". Valid values: ${Object.keys(MILESTONE_MAP).join(", ")}`
    );
    process.exit(1);
  }

  const rootDir = resolve(import.meta.dirname ?? ".", "../..");
  const runner = new ExperimentRunner({
    tasks_dir: resolve(rootDir, "experiments/tasks"),
    config_dir: resolve(rootDir, "experiments/config"),
    results_dir: resolve(rootDir, "experiments/results"),
    dry_run: args.dry_run,
  });

  console.log(`Milestone: ${args.milestone}`);
  console.log(`Dry run: ${args.dry_run}`);
  console.log(
    `Filter: ${filter.conditions.length} conditions × ${filter.tasks.length} tasks × ${filter.context_sizes.length} contexts × ${filter.sessions} sessions`
  );
  console.log(
    `Total runs: ${filter.conditions.length * filter.tasks.length * filter.context_sizes.length * filter.sessions}`
  );
  console.log("");

  await runner.run(filter, args.experiment_id);
}

main().catch((err) => {
  console.error("Experiment failed:", err);
  process.exit(1);
});
