/**
 * Continual Learning Metrics — Issue #106 (#95-A)
 *
 * Pure functions implementing CL metrics from SWE-Bench-CL (arXiv:2507.00014 Section 7).
 * No I/O, no side effects.
 *
 * Matrix convention (matches paper):
 *   a[i][j] = performance on task j after training through task i
 *   Rows = training stage (which task was last trained on)
 *   Columns = evaluation task
 *   a[i][i] = diagonal = performance on task i when first introduced (plasticity)
 *   a[i][i+1] = superdiagonal = performance on next task after training on current
 *   a[N-1][j] = last row = final accuracy on task j after all training
 *   baseline[j] = performance on task j without any memory/experience
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
 * Uses the superdiagonal: after training on task i, performance on task i+1
 * compared to baseline.
 *
 * @param a - Performance matrix a[trained_on][eval_task]
 * @param baseline - Baseline performance per task (no memory condition)
 * @returns Mean forward transfer score. Returns 0 for N <= 1.
 */
export function computeForwardTransfer(a: number[][], baseline: number[]): number {
  const N = a.length;
  if (N <= 1) return 0;

  let sum = 0;
  for (let i = 0; i < N - 1; i++) {
    const a_i_next = a[i][i + 1] ?? 0;
    sum += a_i_next - baseline[i + 1];
  }
  return sum / (N - 1);
}

/**
 * Forgetting: measures how previously learned knowledge degrades over time.
 * F = (1/(N-1)) * Σ_{j=0}^{N-2} (max_{k: 0<=k<=N-1} a[k][j] - a[N-1][j])
 *
 * For each eval task j (excluding the last), computes the gap between
 * peak performance (across all training stages) and final performance
 * (after training on all tasks).
 *
 * @param a - Performance matrix a[trained_on][eval_task]
 * @returns Mean forgetting score (0 = no forgetting). Returns 0 for N <= 1.
 */
export function computeForgetting(a: number[][]): number {
  const N = a.length;
  if (N <= 1) return 0;

  const numTasks = a[0]?.length ?? 0;
  if (numTasks <= 1) return 0;

  let totalForgetting = 0;
  // Sum over eval tasks j = 0..N-2 (exclude last task per paper)
  for (let j = 0; j < numTasks - 1; j++) {
    // Read column j: performance on task j across all training stages
    let maxPerf = -Infinity;
    for (let k = 0; k < N; k++) {
      maxPerf = Math.max(maxPerf, a[k][j] ?? 0);
    }
    const finalPerf = a[N - 1][j] ?? 0;
    totalForgetting += Math.max(0, maxPerf - finalPerf);
  }

  return totalForgetting / (numTasks - 1);
}

/**
 * Plasticity: mean of diagonal elements a[i][i].
 * Measures immediate learning ability on each task when first introduced.
 */
function computePlasticity(a: number[][]): number {
  if (a.length === 0) return 0;

  let sum = 0;
  let count = 0;
  for (let i = 0; i < a.length; i++) {
    if (i < a[i].length) {
      sum += a[i][i];
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
function computeACC(a: number[][]): number {
  if (a.length === 0) return 0;
  const lastRow = a[a.length - 1];
  if (lastRow.length === 0) return 0;
  return lastRow.reduce((s, v) => s + v, 0) / lastRow.length;
}

/**
 * CL-Fβ: harmonic mean of CL-Plasticity and CL-Stability.
 * CL-Fβ = (1 + β²) * P * S / (β² * P + S)
 * where P = plasticity, S = max(0, 1 - forgetting)
 *
 * @param a - Performance matrix a[trained_on][eval_task]
 * @param _baseline - Baseline (unused in Fβ, kept for API consistency)
 * @param beta - Weight parameter (default 1 = equal weight)
 * @returns CL-Fβ score
 */
export function computeCLFbeta(a: number[][], _baseline: number[], beta: number = 1): number {
  if (a.length === 0) return 0;

  const plasticity = computePlasticity(a);
  const forgetting = computeForgetting(a);
  const stability = Math.max(0, 1 - forgetting);

  if (plasticity === 0 || stability === 0) return 0;

  const betaSq = beta * beta;
  return ((1 + betaSq) * plasticity * stability) / (betaSq * plasticity + stability);
}

/**
 * CL-Score: composite score combining accuracy and forward transfer.
 * CL-Score = ACC + FWT - Forgetting
 *
 * Simplified from the paper's full formula (BWT, AULC, TUE terms omitted).
 *
 * @param a - Performance matrix a[trained_on][eval_task]
 * @param baseline - Baseline performance per task
 * @returns Composite CL score
 */
export function computeCLScore(a: number[][], baseline: number[]): number {
  if (a.length === 0) return 0;

  const acc = computeACC(a);
  const fwt = computeForwardTransfer(a, baseline);
  const forgetting = computeForgetting(a);

  return acc + fwt - forgetting;
}

/**
 * Compute all CL metrics in one call.
 *
 * @param a - Performance matrix a[trained_on][eval_task]
 * @param baseline - Baseline performance per task (no memory condition)
 * @returns All CL metrics
 */
export function computeAllCLMetrics(a: number[][], baseline: number[]): CLMetricsResult {
  const forward_transfer = computeForwardTransfer(a, baseline);
  const forgetting = computeForgetting(a);
  const plasticity = computePlasticity(a);
  const stability = Math.max(0, 1 - forgetting);
  const cl_f_beta = computeCLFbeta(a, baseline);
  const cl_score = computeCLScore(a, baseline);

  return {
    forward_transfer,
    forgetting,
    plasticity,
    stability,
    cl_f_beta,
    cl_score,
  };
}
