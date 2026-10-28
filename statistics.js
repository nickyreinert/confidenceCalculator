function relativeInterval(n1, c1, n2, c2, alpha = 0.05, tails = 2) {
  if (![n1, c1, n2, c2].every(Number.isFinite) || n1 <= 0 || n2 <= 0 ||
      c1 < 0 || c2 < 0 || ![n1, c1, n2, c2].every(Number.isInteger) ||
      !(alpha > 0 && alpha < 1)) return null;
  const baseline = c1 / n1, variant = c2 / n2;
  if (baseline === 0) return { uplift: null, lower: null, upper: null };
  const count = isCountMetric(baseline, variant);
  const score = ratio => {
    let fitted;
    if (count) fitted = (c1 + c2) / (n1 + ratio * n2);
    else {
      const linear = n1 + c2 + ratio * (n2 + c1);
      const discriminant = Math.max(0, linear * linear - 4 * ratio * (n1 + n2) * (c1 + c2));
      fitted = 2 * (c1 + c2) / (linear + Math.sqrt(discriminant));
      fitted = Math.min(fitted, 1, 1 / ratio);
    }
    const variance = rateVariance(ratio * fitted, count) / n2 +
      ratio * ratio * rateVariance(fitted, count) / n1;
    const difference = variant - ratio * baseline;
    return variance > 0 ? difference / Math.sqrt(variance) :
      difference === 0 ? 0 : Math.sign(difference) * Infinity;
  };
  const critical = invNorm(1 - alpha / tails);
  const estimate = variant / baseline;
  const root = (left, right, target) => {
    for (let iteration = 0; iteration < 100; iteration++) {
      const middle = (left + right) / 2;
      if (score(middle) > target) left = middle;
      else right = middle;
    }
    return (left + right) / 2;
  };
  const lower = estimate === 0 ? 0 : root(0, estimate, critical);
  let bound = Math.max(1, estimate * 2);
  while (score(bound) > -critical && bound < 1e15) bound *= 2;
  const upper = tails === 1 ? Infinity : score(bound) > -critical ? Infinity : root(estimate, bound, -critical);
  return { uplift: estimate - 1, lower: lower - 1, upper: upper - 1 };
}

function intervalText(interval) {
  if (!interval || interval.uplift === null) return 'Undefined: control has no conversions';
  const endpoint = value => value === Infinity ? 'unbounded' : `${value > 0 ? '+' : ''}${fmt(value * 100, 2)}%`;
  return `${endpoint(interval.lower)} to ${endpoint(interval.upper)}`;
}