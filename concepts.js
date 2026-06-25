// Each entry: id, tooltip (1-2 sentences), deep (full HTML for sidebar body)
const CONCEPTS = {
  confidence: {
    label: 'Confidence Level',
    tooltip: 'In this calculator: confidence = 1 − p-value. Higher confidence means lower Type-I error risk, not a magic guarantee.',
    deep: `
      <p>You want to make sure the result of your A/B test is not just coincidence, luck or plain noise.</p>
      <p>In this calculator, confidence is reported as <code>confidence = 1 − p-value</code>. So a p-value of 0.05 is shown as 95% confidence.</p>
      <p>Strictly speaking, confidence levels and p-values are distinct statistical concepts. But this representation is common in A/B testing tools because it is intuitive for non-specialists — and yes, that is what this calculator reports.</p>
      <p>Higher confidence means a lower chance of a <strong>Type-I error</strong>: a false positive where the test suggests an effect exists while, in reality, no effect exists.</p>
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
    tooltip: 'How compatible your observed data is with “no real effect”. Lower p-value means stronger evidence against the null hypothesis.',
    deep: `
      <p>The p-value estimates how compatible your observed data is with the assumption that there is no real effect.</p>
      <p>In other words: if the null hypothesis were true, how surprising would a difference this large be?</p>
      <p><strong>p = 0.04</strong> means: if there were truly no difference, random sampling would produce a gap this large only 4% of the time.</p>
      <p>The significance level is the threshold; the p-value is the result. The p-value must be below your significance level before you reject the null hypothesis.</p>
      <p>Relationship in this calculator: <code>confidence = 1 − p</code>. So p = 0.05 becomes 95% confidence.</p>
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
    tooltip: 'The bookkeeping baseline: the test has no real effect on conversion rate.',
    deep: `
      <p>The null hypothesis says: <em>"The test will have no effect on the conversion rate."</em></p>
      <p>Your goal is to find enough evidence to reject it. Statistics does not prove the null hypothesis wrong with absolute certainty; it measures how unlikely your data would be if the null hypothesis were true.</p>
      <p>Failing to reject it does not prove the variant has no effect. It only means your data is not strong enough to rule out chance yet — maybe the effect is small, maybe you need more visitors, maybe nothing is going on.</p>
    `
  },
  althypothesis: {
    label: 'Test Type / Alternative Hypothesis',
    tooltip: 'One-tailed checks one direction. Two-tailed checks both increase and decrease.',
    deep: `
      <p>The alternative hypothesis says: <em>"The test will have an effect on the conversion rate."</em></p>
      <p>A test can have two effects: the conversion rate can increase or decrease. A <strong>two-tailed</strong> test assumes both directions are possible.</p>
      <p>A <strong>one-tailed</strong> test assumes only one direction is possible. It needs less data and reaches confidence faster, but there is a catch: if the effect goes the other way, you will not see it because it is not part of the calculation.</p>
      <p>Use one-tailed only when you can honestly commit to one direction before the test starts.</p>
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
    tooltip: 'Expected or observed relative change in conversion rate. +10% uplift is not +10 percentage points.',
    deep: `
      <p>Uplift is the expected or observed change in conversion rate. This calculator reports it as a <strong>relative</strong> change:</p>
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
    tooltip: 'If a real effect exists, how likely is your test to detect it? Higher power means fewer false negatives.',
    deep: `
      <p>Power answers this question: assuming there is a real effect, how likely is this test to detect it?</p>
      <p>It is almost the opposite side of confidence. Confidence is about avoiding a <strong>Type-I error</strong> or false positive. Power is about avoiding a <strong>Type-II error</strong> or false negative.</p>
      <p><code>Power = 1 − β</code>, where β is the Type-II error rate. At <strong>80% power</strong>, you still miss the assumed real effect 20% of the time.</p>
      <p>Power is not part of the p-value calculation for the observed result. It helps you estimate before the test starts how many visitors are needed to reliably detect an effect.</p>
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
    tooltip: 'More variants mean more chances to find a lucky winner. Bonferroni divides α by the number of comparisons.',
    deep: `
      <p>If you compare multiple variants against one control group, the chance of seeing at least one seemingly significant result purely by chance increases. I mean, there are so many colors.</p>
      <p>The <strong>Bonferroni correction</strong> reduces that Type-I error risk by dividing the significance level α by the number of comparisons:</p>
      <p><code>α_adjusted = α / number_of_variants</code></p>
      <p>The adjusted significance level is then used instead of the original one when evaluating each variant. That raises the confidence threshold for everyone.</p>
      <p>It is conservative and can miss real effects, but it is straightforward and easy to explain. When you have only one variant, no correction is applied.</p>
    `
  }
};
