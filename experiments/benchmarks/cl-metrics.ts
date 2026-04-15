/**
 * Continual Learning Metrics — Issue #106 (#95-A)
 *
 * Pure functions implementing CL metrics from SWE-Bench-CL (arXiv:2507.00014 Section 7).
 * No I/O, no side effects.
 *
 * Terminology:
 *   sessions[i][j] = performance of task i after training on session j
 *   The "performance matrix" is tasks × sessions (rows = tasks, columns = sessions)
 *   baseline[i] = performance of task i without any memory/experience
 *
 * Simplifications vs. full paper:
 *   CL-Score uses ACC + FWT - Forgetting (BWT/AULC/TUE omitted, equivalent to all λ=1 and
 *   those terms = 0). This matches the paper's primary evaluation axis.
 */

/**
 * Result type for computeAllCLMetrics
 */
export interface CLMetricsResult {
  forward_transfer: number;
  forgetting: number;
  plasticity: number;
  stability: number;
  cl_f_beta: number;
  cl_score: number;
}

/**
 * Forward Transfer: measures how past experience improves performance on new tasks.
 * FT = (1/(N-1)) * Σ_{i=0}^{N-2} (a[i][i+1] - baseline[i+1])
 *
 * Uses the superdiagonal of the performance matrix: after training on task i,
 * how well does the agent perform on task i+1 compared to baseline?
 *
 * @param sessions - Performance matrix: sessions[task][session]
 * @param baseline - Baseline performance per task (no memory condition)
 * @returns Mean forward transfer score. Returns 0 for N <= 1.
 */
export function computeForwardTransfer(sessions: number[][], baseline: number[]): number {
  const N = sessions.length;
  if (N <= 1) return 0;

  let sum = 0;
  for (let i = 0; i < N - 1; i++) {
    const a_i_next = sessions[i][i + 1] ?? 0;
    sum += a_i_next - baseline[i + 1];
  }
  return sum / (N - 1);
}

/**
 * Forgetting: measures how previously learned knowledge degrades over time.
 * F = (1/(N-1)) * Σ_{j=0}^{N-2} (max_{k<=j} a[j][k] - a[j][T])
 *
 * Excludes the last task (no subsequent sessions to forget).
 * Max is taken over sessions up to and including the task's introduction.
 *
 * @param sessions - Performance matrix: sessions[task][session]
 * @returns Mean forgetting score (0 = no forgetting). Returns 0 for N <= 1.
 */
export function computeForgetting(sessions: number[][]): number {
  const N = sessions.length;
  if (N <= 1) return 0;

  const numSessions = sessions[0]?.length ?? 0;
  if (numSessions <= 1) return 0;

  let totalForgetting = 0;
  // Sum over tasks j = 0..N-2 (exclude last task per paper)
  for (let j = 0; j < N - 1; j++) {
    const taskPerf = sessions[j];
    const lastPerf = taskPerf[taskPerf.length - 1];
    const maxPerf = Math.max(...taskPerf);
    totalForgetting += Math.max(0, maxPerf - lastPerf);
  }

  return totalForgetting / (N - 1);
}

/**
 * Plasticity: mean of diagonal elements (sessions[i][i]).
 * Measures immediate learning ability on each task.
 */
function computePlasticity(sessions: number[][]): number {
  if (sessions.length === 0) return 0;

  let sum = 0;
  let count = 0;
  for (let i = 0; i < sessions.length; i++) {
    if (i < sessions[i].length) {
      sum += sessions[i][i];
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

/**
 * ACC: mean of the last row of the performance matrix.
 * Measures final retained accuracy across all tasks after all training.
 * ACC = (1/N) * Σ_{j=0}^{N-1} a[N-1][j]
 */
function computeACC(sessions: number[][]): number {
  if (sessions.length === 0) return 0;
  const lastRow = sessions[sessions.length - 1];
  if (lastRow.length === 0) return 0;
  return lastRow.reduce((s, v) => s + v, 0) / lastRow.length;
}

/**
 * CL-Fβ: harmonic mean of CL-Plasticity and CL-Stability.
 * CL-Fβ = (1 + β²) * P * S / (β² * P + S)
 * where P = plasticity, S = 1 - forgetting
 *
 * @param sessions - Performance matrix: sessions[task][session]
 * @param _baseline - Baseline (unused in Fβ, kept for API consistency)
 * @param beta - Weight parameter (default 1 = equal weight)
 * @returns CL-Fβ score
 */
export function computeCLFbeta(
  sessions: number[][],
  _baseline: number[],
  beta: number = 1
): number {
  if (sessions.length === 0) return 0;

  const plasticity = computePlasticity(sessions);
  const forgetting = computeForgetting(sessions);
  const stability = 1 - forgetting;

  if (plasticity === 0 || stability <= 0) return 0;

  const betaSq = beta * beta;
  return ((1 + betaSq) * plasticity * stability) / (betaSq * plasticity + stability);
}

/**
 * CL-Score: composite score combining accuracy and forward transfer.
 * CL-Score = ACC + FWT - Forgetting
 *
 * Simplified from the paper's full formula (BWT, AULC, TUE terms omitted).
 *
 * @param sessions - Performance matrix: sessions[task][session]
 * @param baseline - Baseline performance per task
 * @returns Composite CL score
 */
export function computeCLScore(sessions: number[][], baseline: number[]): number {
  if (sessions.length === 0) return 0;

  const acc = computeACC(sessions);
  const fwt = computeForwardTransfer(sessions, baseline);
  const forgetting = computeForgetting(sessions);

  return acc + fwt - forgetting;
}

/**
 * Compute all CL metrics in one call.
 *
 * @param acm - Performance matrix for ACM condition: acm[task][session]
 * @param baseline - Baseline performance per task (no memory condition)
 * @returns All CL metrics
 */
export function computeAllCLMetrics(acm: number[][], baseline: number[]): CLMetricsResult {
  const forward_transfer = computeForwardTransfer(acm, baseline);
  const forgetting = computeForgetting(acm);
  const plasticity = computePlasticity(acm);
  const stability = 1 - forgetting;
  const cl_f_beta = computeCLFbeta(acm, baseline);
  const cl_score = computeCLScore(acm, baseline);

  return {
    forward_transfer,
    forgetting,
    plasticity,
    stability,
    cl_f_beta,
    cl_score,
  };
}
