// Each entry: id, tooltip (1-2 sentences), deep (full HTML for sidebar body)
const CONCEPTS = {
  confidence: {
    label: 'Confidence Level',
    tooltip: 'How sure are we this result is not just luck? Higher = more trustworthy.',
    deep: `
      <p>Confidence level answers: <em>"If this variant truly had zero effect, how often would
      random chance alone produce a result at least this extreme?"</em></p>
      <p>At <strong>95% confidence</strong>, the answer is: only 5% of the time. That means
      you'd expect a false positive once every 20 tests — even when nothing is really going on.</p>
      <p>It is <strong>not</strong> the probability the variant is better. It is the probability
      that the observed difference is not explained by noise alone.</p>
      <h4>Common thresholds</h4>
      <ul>
        <li><strong>90%</strong> — exploratory tests, low-stakes decisions</li>
        <li><strong>95%</strong> — standard for most product A/B tests</li>
        <li><strong>99%</strong> — high-stakes changes, pricing, legal-adjacent decisions</li>
      </ul>
    `
  },
  pvalue: {
    label: 'p-value',
    tooltip: 'Probability that pure luck produced this result. Lower = more confident.',
    deep: `
      <p>The p-value is the probability of seeing a difference <em>at least as extreme</em>
      as yours, assuming the null hypothesis is true (i.e., the variant has zero effect).</p>
      <p><strong>p = 0.04</strong> means: if there were truly no difference, random sampling
      would produce a gap this large only 4% of the time.</p>
      <p>Relationship to confidence: <code>confidence = 1 − p</code>. So p = 0.05 → 95% confidence.</p>
      <h4>Common misconceptions</h4>
      <ul>
        <li>p-value is <strong>not</strong> the probability the variant is better.</li>
        <li>p &lt; 0.05 does <strong>not</strong> mean the effect is large or meaningful.</li>
        <li>A high p-value does not prove the null is true — it just means you lack evidence.</li>
      </ul>
    `
  },
  nullhypothesis: {
    label: 'Null Hypothesis (H₀)',
    tooltip: 'The skeptic\'s claim: there is no real difference, any gap is random noise.',
    deep: `
      <p>The null hypothesis (H₀) is the baseline assumption you are trying to disprove:
      <em>"Control and variant perform identically. Any observed difference is random sampling noise."</em></p>
      <p>Statistics does not prove H₀ is wrong — it measures how unlikely your data would be
      <em>if</em> H₀ were true. When that probability drops below your threshold (e.g. 5%),
      you <strong>reject</strong> H₀ and accept that something real is going on.</p>
      <p>Failing to reject H₀ does not prove the variant has no effect. It only means your
      data isn't strong enough to rule out chance yet — you may simply need more visitors.</p>
    `
  },
  althypothesis: {
    label: 'Alternative Hypothesis (H₁)',
    tooltip: 'The optimist\'s claim: the variant is genuinely different from control.',
    deep: `
      <p>The alternative hypothesis (H₁) is what you hope to demonstrate:
      <em>"The variant produces a different conversion rate than control."</em></p>
      <p>In a <strong>two-tailed</strong> test, H₁ covers both directions (variant could be
      better or worse). In a <strong>one-tailed</strong> test, H₁ only covers one direction
      (e.g., variant is strictly better). One-tailed tests reach significance faster but are
      only valid when you have a strong prior that the effect can't go the other way.</p>
    `
  },
  zscore: {
    label: 'Z-Score',
    tooltip: 'Signal-to-noise ratio. Above ~1.96 = 95% confidence in a two-tailed test.',
    deep: `
      <p>The z-score measures how many standard errors the observed difference sits away from zero.</p>
      <p>Formula: <code>z = (p₂ − p₁) / SE</code>, where SE is the pooled standard error.</p>
      <p>The further z is from zero, the less likely the result is due to chance:</p>
      <ul>
        <li><strong>|z| ≥ 1.645</strong> → 90% confidence (two-tailed)</li>
        <li><strong>|z| ≥ 1.960</strong> → 95% confidence (two-tailed)</li>
        <li><strong>|z| ≥ 2.576</strong> → 99% confidence (two-tailed)</li>
      </ul>
      <p>A negative z means the variant performed <em>worse</em> than control.</p>
    `
  },
  uplift: {
    label: 'Uplift / Lift',
    tooltip: 'Relative improvement of variant vs control. +10% uplift ≠ +10 percentage points.',
    deep: `
      <p>Uplift (also called lift) is the <em>relative</em> change in conversion rate:</p>
      <p><code>uplift = (variant rate − control rate) / control rate</code></p>
      <p>Example: control converts at 5%, variant at 5.5%.<br>
      Absolute difference = 0.5 pp. Relative uplift = +10%.</p>
      <p>Always check both: a 50% relative uplift from 0.2% to 0.3% is commercially very
      different from 50% uplift from 10% to 15%.</p>
      <p>This calculator shows <strong>relative uplift</strong> in the main results and
      <strong>absolute difference (pp)</strong> as a secondary metric.</p>
    `
  },
  power: {
    label: 'Statistical Power',
    tooltip: 'If a real effect exists, how likely is your test to detect it? 80% is standard.',
    deep: `
      <p>Statistical power is the probability that your test will correctly detect a true
      effect when one exists. Power = 1 − β, where β is the type-II error rate (false negative).</p>
      <p><strong>80% power</strong> means: if the variant truly wins by the assumed margin,
      you will detect it 80% of the time. You will miss it 20% of the time.</p>
      <p>Power affects required sample size: higher power → more visitors needed. This calculator
      uses your power setting when projecting how many days a test needs to run.</p>
      <h4>Power depends on</h4>
      <ul>
        <li>The true effect size (bigger effect → easier to detect)</li>
        <li>Your sample size (more visitors → more power)</li>
        <li>Your significance threshold α (stricter threshold → less power)</li>
      </ul>
    `
  },
  bonferroni: {
    label: 'Bonferroni Correction',
    tooltip: 'Multiple variants inflate false-positive risk. Bonferroni divides α by variant count.',
    deep: `
      <p>When you run multiple comparisons (e.g., Control vs A, Control vs B, Control vs C),
      the chance of getting <em>at least one</em> false positive grows with each comparison.</p>
      <p>With 3 variants and α = 0.05 each, the family-wise error rate is approximately
      1 − (0.95)³ ≈ <strong>14.3%</strong> — nearly 3× your intended risk.</p>
      <p>The <strong>Bonferroni correction</strong> divides α by the number of comparisons,
      so each individual test uses a stricter threshold:</p>
      <p><code>α_adjusted = α / number_of_variants</code></p>
      <p>It is conservative (can miss real effects) but straightforward and well-understood.
      When you have only one variant, no correction is applied.</p>
    `
  }
};
