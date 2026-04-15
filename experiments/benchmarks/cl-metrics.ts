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
 *   Matrix MUST be square (N × N). Non-square input throws RangeError (for N > 1;
 *   N <= 1 returns 0 for transfer/forgetting metrics without validation).
 *   All elements must be finite (NaN/Infinity throws RangeError).
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

/** Validate that a is a square N×N matrix with all finite values. */
function assertSquareMatrix(a: number[][], caller: string): void {
  const N = a.length;
  for (let i = 0; i < N; i++) {
    if (a[i].length !== N) {
      throw new RangeError(
        `${caller}: matrix must be square (row ${i} has ${a[i].length} cols, expected ${N})`
      );
    }
    for (let j = 0; j < N; j++) {
      if (!Number.isFinite(a[i][j])) {
        throw new RangeError(`${caller}: non-finite value at [${i}][${j}]: ${a[i][j]}`);
      }
    }
  }
}

/**
 * Forward Transfer: measures how past experience improves performance on new tasks.
 * FT = (1/(N-1)) * Σ_{i=0}^{N-2} (a[i][i+1] - baseline[i+1])
 *
 * Uses the superdiagonal: after training on task i, performance on task i+1
 * compared to baseline.
 *
 * @param a - Square performance matrix a[trained_on][eval_task]
 * @param baseline - Baseline performance per task (length must be >= N)
 * @returns Mean forward transfer score. Returns 0 for N <= 1.
 */
export function computeForwardTransfer(a: number[][], baseline: number[]): number {
  if (a.length === 0) return 0;
  assertSquareMatrix(a, "computeForwardTransfer");
  const N = a.length;
  if (N <= 1) return 0;

  if (baseline.length < N) {
    throw new RangeError(
      `computeForwardTransfer: baseline length ${baseline.length} must be >= matrix size ${N}`
    );
  }

  let sum = 0;
  for (let i = 0; i < N - 1; i++) {
    sum += a[i][i + 1] - baseline[i + 1];
  }
  return sum / (N - 1);
}

/**
 * Forgetting: measures how previously learned knowledge degrades over time.
 * F = (1/(N-1)) * Σ_{j=0}^{N-2} max(0, max_{k=0}^{j} a[k][j] - a[N-1][j])
 *
 * For each eval task j (excluding the last), computes the gap between
 * peak performance (up to training stage j, when task j was introduced)
 * and final performance (after training on all tasks).
 *
 * The max range k=0..j follows the paper: peak is measured over training
 * stages up to when the task was last directly trained, not globally.
 *
 * @param a - Square performance matrix a[trained_on][eval_task]
 * @returns Mean forgetting score (0 = no forgetting). Returns 0 for N <= 1.
 */
export function computeForgetting(a: number[][]): number {
  if (a.length === 0) return 0;
  assertSquareMatrix(a, "computeForgetting");
  const N = a.length;
  if (N <= 1) return 0;

  let totalForgetting = 0;
  for (let j = 0; j < N - 1; j++) {
    let maxPerf = -Infinity;
    // Peak performance on task j up to training stage j (paper: max_{1≤k≤j})
    for (let k = 0; k <= j; k++) {
      maxPerf = Math.max(maxPerf, a[k][j]);
    }
    const finalPerf = a[N - 1][j];
    totalForgetting += Math.max(0, maxPerf - finalPerf);
  }

  return totalForgetting / (N - 1);
}

/**
 * Plasticity: mean of diagonal elements a[i][i].
 * Measures immediate learning ability on each task when first introduced.
 */
function computePlasticity(a: number[][]): number {
  if (a.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i][i];
  }
  return sum / a.length;
}

/**
 * ACC: mean of the last row of the performance matrix.
 * Measures final retained accuracy across all tasks after all training.
 * ACC = (1/N) * Σ_{j=0}^{N-1} a[N-1][j]
 */
function computeACC(a: number[][]): number {
  if (a.length === 0) return 0;
  const lastRow = a[a.length - 1];
  return lastRow.reduce((s, v) => s + v, 0) / lastRow.length;
}

/**
 * CL-Fβ: harmonic mean of CL-Plasticity and CL-Stability.
 * CL-Fβ = (1 + β²) * P * S / (β² * P + S)
 * where P = plasticity, S = max(0, 1 - forgetting)
 *
 * @param a - Square performance matrix a[trained_on][eval_task]
 * @param beta - Weight parameter (default 1 = equal weight)
 * @returns CL-Fβ score
 */
export function computeCLFbeta(a: number[][], beta: number = 1): number {
  if (a.length === 0) return 0;
  assertSquareMatrix(a, "computeCLFbeta");

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
 * @param a - Square performance matrix a[trained_on][eval_task]
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
 * Compute all CL metrics in one call. Avoids redundant sub-computations.
 * CL-Fβ is computed with β=1 (standard harmonic mean).
 *
 * @param a - Square performance matrix a[trained_on][eval_task]
 * @param baseline - Baseline performance per task (no memory condition)
 * @returns All CL metrics (cl_f_beta uses β=1)
 */
export function computeAllCLMetrics(a: number[][], baseline: number[]): CLMetricsResult {
  if (a.length === 0) {
    return {
      forward_transfer: 0,
      forgetting: 0,
      plasticity: 0,
      stability: 0,
      cl_f_beta: 0,
      cl_score: 0,
    };
  }

  assertSquareMatrix(a, "computeAllCLMetrics");
  const N = a.length;
  if (baseline.length < N) {
    throw new RangeError(
      `computeAllCLMetrics: baseline length ${baseline.length} must be >= matrix size ${N}`
    );
  }

  const forward_transfer = computeForwardTransfer(a, baseline);
  const forgetting = computeForgetting(a);
  const plasticity = computePlasticity(a);
  const stability = Math.max(0, 1 - forgetting);
  const acc = computeACC(a);

  // Inline CL-Fβ (β=1) to avoid recomputing forgetting/plasticity
  let cl_f_beta: number;
  if (plasticity === 0 || stability === 0) {
    cl_f_beta = 0;
  } else {
    cl_f_beta = (2 * plasticity * stability) / (plasticity + stability);
  }

  const cl_score = acc + forward_transfer - forgetting;

  return { forward_transfer, forgetting, plasticity, stability, cl_f_beta, cl_score };
}
