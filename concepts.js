// Each entry: id, tooltip (1-2 sentences), deep (full HTML for sidebar body)
const CONCEPTS = {
  confidence: {
    label: 'Confidence Level',
    tooltip: 'The long-run coverage of newly calculated intervals, not a probability that the variant wins. 95% confidence matches α = 5%.',
    deep: `
      <p>Repeat the experiment and calculate a NEW interval each time. About 95 out of 100 intervals constructed using a 95% confidence method would contain the TRUE effect, which could be positive, negative, or zero.</p>
      <p>Coverage concerns different intervals across experiments with a fixed true effect, not 95% of future results falling inside today's interval. It is not a 95% probability the variant wins or the measured uplift will repeat.</p>
      <p>For matching tests and intervals, a 95% confidence level corresponds to significance level α = 5%. The selected confidence level is not <code>1 − p-value</code>.</p>
      <p>The relative uplift interval inverts a two-sample score test for the rate ratio. Excluding zero matches the two-sided significance decision. Multiple comparisons use the same Bonferroni-adjusted α in the test and interval. A one-sided increase test uses a matching lower bound instead.</p>
      <h4>Common thresholds</h4>
      <ul>
        <li><strong>90%</strong> — exploratory tests, low-stakes decisions</li>
        <li><strong>95%</strong> — standard for most product A/B tests</li>
        <li><strong>99%</strong> — high-stakes changes, pricing, legal-adjacent decisions</li>
      </ul>
    `
  },
  interval: {
    label: 'Uplift confidence interval',
    tooltip: 'Uncertainty around relative uplift. Zero means no change; an interval crossing zero is not significant.',
    deep: `
      <p>The point estimate is the observed relative uplift. The interval describes its uncertainty, not a guaranteed range for future results.</p>
      <p>A two-sided interval excluding zero matches a significant result. A one-sided increase test shows a lower bound with no upper limit. Not significant does not mean no effect.</p>
      <p>Across repeated experiments, a 95% method produces intervals containing the true effect about 95% of the time. This is not a 95% probability the variant wins.</p>
      <p>With multiple variants, the displayed level is Bonferroni-adjusted per comparison; the selected level applies to the family. Zero control conversions make relative uplift and its interval undefined; the absolute difference and test remain available.</p>
      <p>The score approximation assumes independent binary outcomes, or independent Poisson event rates for count metrics. Sparse samples, boundary rates and correlated observations need caution.</p>
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
      <p>IF there is NO REAL EFFECT, a 5% significance level means about 5 out of 100 comparable experiments would falsely report a statistically significant difference. This error rate requires a preplanned test, not repeatedly checking and stopping at significance.</p>
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
    tooltip: 'IF a real effect of the SPECIFIED SIZE exists, how often would comparable tests detect it? Power is not the probability the observed result is correct.',
    deep: `
      <p>IF a real effect of the SPECIFIED SIZE exists, 80 out of 100 comparable experiments would detect it as statistically significant at 80% power.</p>
      <p>Choose a separate, relevant effect size for planning. Power calculated from today's observed uplift is not independent evidence that the result is correct. The calculator never automatically copies observed uplift into this assumption.</p>
      <p>Power concerns false negatives conditional on an assumed effect. Significance level α concerns false positives when the true effect is zero. Neither is the probability that today's decision is right.</p>
      <p><code>Power = 1 − β</code>, where β is the Type-II error rate. At <strong>80% power</strong>, you still miss the assumed real effect 20% of the time.</p>
      <p>Power is not part of the p-value calculation for the observed result. It helps you estimate before the test starts how many visitors are needed to reliably detect an effect.</p>
      <p>Sufficient power does not establish sufficient calendar duration. Plan business cycles and a stopping rule in advance; do not repeatedly check and stop when significance appears.</p>
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
  },
  splitStability: {
    label: 'Split stability',
    tooltip: 'Checks if every week got roughly the same split as your totals. A split that moves over time can make the totals mislead.',
    deep: `
      <p>Your totals have a split — say 50/50 or 10/90. The daily data shows if that split held up week by week.</p>
      <p>Small ups and downs are normal. The check only warns when the changes are both too big to be chance <em>and</em> at least 2 percentage points.</p>
      <h4>Why it matters</h4>
      <p>Say control gets most visitors in a strong sales week and the variant gets most in a weak one. Then the variant looks worse — not because of the change you made, but because of <em>when</em> its visitors came.</p>
      <h4>Common causes</h4>
      <ul>
        <li>The split was changed while the test was running</li>
        <li>Tracking broke for one group on some days</li>
        <li>Bots or a campaign landing in one group</li>
      </ul>
      <p>If the split changed, look at the traffic chart and judge the period with a steady split on its own.</p>
    `
  },
  recentTraffic: {
    label: 'Traffic basis',
    tooltip: 'Projections need to know how many visitors are coming in now. Recent days say more about that than the average since the start.',
    deep: `
      <p>Projections answer "how long until…?" — so they need today's traffic, not last year's.</p>
      <p>Without daily data, the calculator divides all visitors by the days the test has been running. That's fine when traffic is steady. When it isn't — say 390 quiet days and then 10 busy ones — the average is far too low and projections become far too pessimistic.</p>
      <p>With daily data, you choose: the average of the last 7, 14 or 28 days, or of all pasted days. Today is left out while it's still running, because a half day would pull the average down.</p>
      <p><strong>Tip:</strong> 14 days evens out weekday swings. Use 7 days if traffic just changed, 28 days if it's very bumpy. <em>All days</em> only fits when traffic has been steady the whole time.</p>
    `
  }
};
