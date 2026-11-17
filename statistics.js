function relativeInterval(n1, c1, n2, c2, alpha = 0.05, tails = 2, variance1, variance2) {
  if (![n1, c1, n2, c2].every(Number.isFinite) || n1 <= 0 || n2 <= 0 ||
      c1 < 0 || c2 < 0 || ![n1, c1, n2, c2].every(Number.isInteger) ||
      !(alpha > 0 && alpha < 1)) return null;
  const baseline = c1 / n1, variant = c2 / n2;
  if (baseline === 0) return { uplift: null, lower: null, upper: null };
  if (isCountMode()) {
    const v1 = variance1 == null ? baseline * getDispersionFactor() : variance1;
    const v2 = variance2 == null ? variant * getDispersionFactor() : variance2;
    if (![v1, v2].every(value => Number.isFinite(value) && value >= 0)) return null;
    const estimate = variant / baseline;
    if (variant === 0 && v2 === 0) return null;
    const variance = v2 / (n2 * baseline ** 2) +
      variant ** 2 * v1 / (n1 * baseline ** 4);
    if (!(variance >= 0) || !Number.isFinite(variance)) return null;
    const critical = invNorm(1 - alpha / tails);
    const margin = critical * Math.sqrt(variance);
    return {
      uplift: estimate - 1,
      lower: Math.max(0, estimate - margin) - 1,
      upper: tails === 1 ? Infinity : estimate + margin - 1,
    };
  }
  if (c1 > n1 || c2 > n2) return null;
  const score = ratio => {
    let fitted;
    const linear = n1 + c2 + ratio * (n2 + c1);
    const discriminant = Math.max(0, linear * linear - 4 * ratio * (n1 + n2) * (c1 + c2));
    fitted = 2 * (c1 + c2) / (linear + Math.sqrt(discriminant));
    fitted = Math.min(fitted, 1, 1 / ratio);
    const variance = rateVariance(ratio * fitted, false) / n2 +
      ratio * ratio * rateVariance(fitted, false) / n1;
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
  if (!interval) return 'Unavailable';
  if (interval.uplift === null) return 'Undefined: control has no conversions';
  const endpoint = value => value === Infinity ? 'unbounded' : `${value > 0 ? '+' : ''}${fmt(value * 100, 2)}%`;
  return `${endpoint(interval.lower)} to ${endpoint(interval.upper)}`;
}