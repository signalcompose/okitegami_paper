/**
 * Statistics functions for ACM experiment analysis.
 */

/**
 * Calculate arithmetic mean.
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate sample standard deviation (Bessel's correction, n-1).
 * Used for experiment analysis where each run is a sample.
 */
export function standardDeviation(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}

/**
 * Calculate Pearson correlation coefficient.
 * Returns NaN for insufficient data or zero variance.
 */
export function pearsonR(x: number[], y: number[]): number {
  if (x.length !== y.length) throw new Error("Arrays must have same length");
  if (x.length < 2) return NaN;

  const xMean = mean(x);
  const yMean = mean(y);

  let numerator = 0;
  let xSqSum = 0;
  let ySqSum = 0;

  for (let i = 0; i < x.length; i++) {
    const xDiff = x[i] - xMean;
    const yDiff = y[i] - yMean;
    numerator += xDiff * yDiff;
    xSqSum += xDiff ** 2;
    ySqSum += yDiff ** 2;
  }

  const denominator = Math.sqrt(xSqSum * ySqSum);
  if (denominator === 0) return NaN;

  return numerator / denominator;
}

export interface CrossSessionResult {
  delta: number;
  first_session_rate: number;
  last_session_rate: number;
}

/**
 * Calculate improvement from first to last session.
 */
export function crossSessionImprovement(
  sessions: Array<{ session_number: number; completion_rate: number }>
): CrossSessionResult {
  if (sessions.length === 0) return { delta: 0, first_session_rate: 0, last_session_rate: 0 };
  if (sessions.length === 1)
    return {
      delta: 0,
      first_session_rate: sessions[0].completion_rate,
      last_session_rate: sessions[0].completion_rate,
    };

  const sorted = [...sessions].sort((a, b) => a.session_number - b.session_number);
  const first = sorted[0].completion_rate;
  const last = sorted[sorted.length - 1].completion_rate;

  return {
    delta: last - first,
    first_session_rate: first,
    last_session_rate: last,
  };
}
