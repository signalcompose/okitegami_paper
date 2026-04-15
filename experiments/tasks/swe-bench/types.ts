import { z } from "zod";

export const sweBenchTaskSchema = z.object({
  instance_id: z.string(),
  repo: z.string(),
  base_commit: z.string(),
  problem_statement: z.string(),
  patch: z.string(),
  test_patch: z.string(),
  FAIL_TO_PASS: z.array(z.string()),
  PASS_TO_PASS: z.array(z.string()),
});

export type SweBenchTask = z.infer<typeof sweBenchTaskSchema>;
