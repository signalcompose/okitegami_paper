import { z } from "zod";

export const sweBenchTaskSchema = z.object({
  instance_id: z.string(),
  repo: z.string(),
  base_commit: z.string(),
  problem_statement: z.string(),
  patch: z.string().min(1, "patch must not be empty"),
  test_patch: z.string(),
  FAIL_TO_PASS: z.array(z.string()).min(1, "FAIL_TO_PASS must contain at least one test"),
  PASS_TO_PASS: z.array(z.string()),
});

export type SweBenchTask = z.infer<typeof sweBenchTaskSchema>;
