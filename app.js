// ─────────────────────────────────────────────────────────────────────────────
// STATS HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function normalCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return z > 0 ? 1 - p : p;
}

function invNorm(p) {
  const a = [-3.969683028665376e1,2.209460984245205e2,-2.759285104469687e2,1.383577518672690e2,-3.066479806614716e1,2.506628277459239];
  const b = [-5.447609879822406e1,1.615858368580409e2,-1.556989798598866e2,6.680131188771972e1,-1.328068155288572e1];
  const c = [-7.784894002430293e-3,-3.223964580411365e-1,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783];
  const d = [7.784695709041462e-3,3.224671290700398e-1,2.445134137142996,3.754408661907416];
  const pL = 0.02425, pH = 1 - pL;
  let q, r;
  if (p < pL) {
    q = Math.sqrt(-2*Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pH) {
    q = p - 0.5; r = q*q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    q = Math.sqrt(-2*Math.log(1-p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
}

// Rates above 100% mean multiple conversions per visitor (count metric):
// binomial variance p(1-p) is invalid there, so fall back to Poisson variance p.
function isCountMetric(...rates) {
  return rates.some(r => r > 1);
}

function rateVariance(p, count) {
  return count ? p : p*(1-p);
}

function zTest(n1, c1, n2, c2) {
  if (!(n1 > 0) || !(n2 > 0) || c1 < 0 || c2 < 0) return { z: NaN, p1: NaN, p2: NaN, pp: NaN, se: NaN, count: false };
  const p1 = c1/n1, p2 = c2/n2;
  const pp = (c1+c2)/(n1+n2);
  const count = isCountMetric(p1, p2);
  const se = Math.sqrt(rateVariance(pp, count)*(1/n1+1/n2));
  if (!(se > 0)) return { z:0, p1, p2, pp, se, count };
  return { z:(p2-p1)/se, p1, p2, pp, se, count };
}

function pFromZ(z, tails) {
  return Math.max(0, Math.min(1, tails === 1 ? normalCDF(-z) : 2 * normalCDF(-Math.abs(z))));
}

// ─────────────────────────────────────────────────────────────────────────────
// VARIANT STATE
// ─────────────────────────────────────────────────────────────────────────────

const COLORS = ['#2563eb','#7c3aed','#db2777','#ea580c','#16a34a'];
let variants = [];
let nextIdx = 0;

// Returns all group ids in order: control first, then variants
function allGroupIds() {
  return ['ctrl', ...variants.map(vr => vr.id)];
}

document.getElementById('groupsGrid').addEventListener('keydown', event => {
  if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
  const fields = allGroupIds().flatMap(id => ['n', 'c'].map(suffix => document.getElementById(`${id}-${suffix}`)));
  const index = fields.indexOf(event.target);
  if (index < 0) return;
  const next = fields[index + (event.shiftKey ? -1 : 1)];
  if (!next) return;
  event.preventDefault();
  next.focus();
});

// ─────────────────────────────────────────────────────────────────────────────
// TWO-WAY DISTRIBUTION / VISITORS SYNC
// ─────────────────────────────────────────────────────────────────────────────

// Magnetic snap points for the distribution knob
const SNAP_POINTS = [10, 20, 25, 30, 33, 40, 50, 60, 67, 70, 75, 80, 90];
const SNAP_RADIUS = 2; // snap if within ±2 percentage points

function snapDist(raw) {
  for (const s of SNAP_POINTS) {
    if (Math.abs(raw - s) <= SNAP_RADIUS) return s;
  }
  return raw;
}

function setKnobDisplay(id, pct) {
  const knob = document.getElementById(id + '-dist');
  const label = document.getElementById(id + '-dist-val');
  if (knob) knob.value = pct;
  if (label) label.textContent = pct + '%';
}

// Called when user moves the distribution knob for a group.
// Snaps to common values, rebalances others, updates visitor counts.
function onDistKnob(changedId, rawValue) {
  const ids = allGroupIds();
  const total = parseInt(document.getElementById('sTotalVis').value) || 10000;

  let changedPct = snapDist(parseInt(rawValue) || 1);
  const maxForChanged = 100 - (ids.length - 1);
  changedPct = Math.max(1, Math.min(changedPct, maxForChanged));
  setKnobDisplay(changedId, changedPct);

  // Distribute remaining % equally among other groups
  const remaining = 100 - changedPct;
  const others = ids.filter(id => id !== changedId);
  const perOther = Math.round(remaining / others.length);
  others.forEach(id => setKnobDisplay(id, perOther));

  // Update visitor counts from distribution
  ids.forEach(id => {
    const knob = document.getElementById(id + '-dist');
    const pct = knob ? parseInt(knob.value) || 0 : 0;
    const nEl = document.getElementById(id + '-n');
    if (nEl) nEl.value = Math.round(total * pct / 100);
  });

  recalc();
}

// Alias kept for visitor-driven rebalance calls that need to update knob labels
function onDistChange(changedId) { onDistKnob(changedId, document.getElementById(changedId + '-dist')?.value || 50); }

// Called when user edits "Visitors" directly for a group.
// Recomputes that group's distribution %, then rebalances total.
function onVisitorsChange(changedId) {
  const ids = allGroupIds();
  const changedN = parseInt(document.getElementById(changedId + '-n').value) || 0;

  const othersSum = ids
    .filter(id => id !== changedId)
    .reduce((s, id) => s + (parseInt(document.getElementById(id + '-n')?.value) || 0), 0);
  const impliedTotal = changedN + othersSum;

  document.getElementById('sTotalVis').value = impliedTotal;

  ids.forEach(id => {
    const n = parseInt(document.getElementById(id + '-n')?.value) || 0;
    const pct = impliedTotal > 0 ? Math.round(n / impliedTotal * 100) : Math.round(100 / ids.length);
    setKnobDisplay(id, pct);
  });

  recalc();
}

// Called when user edits Total Daily Visitors.
// Keeps distributions, recomputes visitor counts.
function onTotalVisChange() {
  const total = parseInt(document.getElementById('sTotalVis').value) || 0;
  allGroupIds().forEach(id => {
    const knob = document.getElementById(id + '-dist');
    const pct = knob ? parseInt(knob.value) || 0 : 0;
    const nEl = document.getElementById(id + '-n');
    if (nEl) nEl.value = Math.round(total * pct / 100);
  });
  recalc();
}

function addVariant() {
  if (variants.length >= 5) { alert('Maximum 5 variants supported.'); return; }
  const letter = String.fromCharCode(65 + nextIdx);
  const id = 'v' + nextIdx;
  const color = COLORS[variants.length];
  variants.push({ id, label:`Variant ${letter}`, color });

  const ids = allGroupIds();
  const total = parseInt(document.getElementById('sTotalVis').value) || 10000;
  const visitorsEach = Math.round(total / ids.length);
  const equalPctInt = Math.round(100 / ids.length);

  ids.forEach(gid => setKnobDisplay(gid, equalPctInt));

  // Build column: group card on top, result card placeholder below
  const col = document.createElement('div');
  col.className = 'group-col';
  col.id = 'col-' + id;
  col.innerHTML = `
    <div class="group-row" id="grp-${id}">
      <div class="group-row-header">
        <span class="group-badge badge-variant" id="badge-${id}" style="background:${color}">Variant ${letter}</span>
        <button class="btn-remove" onclick="removeVariant('${id}')">✕</button>
      </div>
      <div class="group-row-fields">
        <div class="fg dist-fg">
          <label>Distribution</label>
          <div class="knob-row">
            <input type="range" id="${id}-dist" value="${equalPctInt}" min="1" max="99" step="1" class="dist-knob" oninput="onDistKnob('${id}',this.value)" onchange="onDistKnob('${id}',this.value)">
            <span class="dist-knob-val" id="${id}-dist-val">${equalPctInt}%</span>
          </div>
        </div>
        <div class="fg">
          <label>Visitors</label>
          <input type="number" id="${id}-n" value="${visitorsEach}" min="1" class="input--key" oninput="onVisitorsChange('${id}')">
        </div>
        <div class="fg">
          <label>Conversions</label>
          <input type="number" id="${id}-c" value="270" min="0" class="input--key" oninput="recalc()">
        </div>
        <div class="fg">
          <label>Rate</label>
          <div class="rate-display" id="${id}-rate" style="color:${color}">-</div>
        </div>
      </div>
    </div>
    <div class="result-card-slot" id="result-${id}"></div>`;

  // Insert before the "add" column
  const addCol = document.querySelector('.group-col--add');
  document.getElementById('groupsGrid').insertBefore(col, addCol);
  nextIdx++;

  // Rebalance existing groups' visitor counts
  ids.filter(gid => gid !== id).forEach(gid => {
    const nEl = document.getElementById(gid + '-n');
    if (nEl) nEl.value = visitorsEach;
    setKnobDisplay(gid, equalPctInt);
  });

  recalc();
}

function removeVariant(id) {
  variants = variants.filter(vr => vr.id !== id);
  document.getElementById('col-' + id)?.remove();

  const ids = allGroupIds();
  const total = parseInt(document.getElementById('sTotalVis').value) || 10000;
  ids.forEach(gid => {
    setKnobDisplay(gid, Math.round(100 / ids.length));
    const nEl = document.getElementById(gid + '-n');
    if (nEl) nEl.value = Math.round(total / ids.length);
  });

  recalc();
}

function distributeEvenly() {
  const ids = allGroupIds();
  const total = parseInt(document.getElementById('sTotalVis').value) || 10000;
  const pct = Math.round(100 / ids.length);
  ids.forEach(gid => {
    setKnobDisplay(gid, pct);
    const nEl = document.getElementById(gid + '-n');
    if (nEl) nEl.value = Math.round(total / ids.length);
  });
  recalc();
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN RECALC
// ─────────────────────────────────────────────────────────────────────────────

function v(id) { return parseFloat(document.getElementById(id)?.value) || 0; }
function fmt(n, d=2) { return isFinite(n) ? n.toFixed(d) : '-'; }
function fmtPct(n) { return fmt(n*100,2)+'%'; }

function formatPValue(p) {
  if (!Number.isFinite(p)) return 'Unavailable';
  if (p < 0.000001) return '< 0.000001';
  return p.toFixed(p < 0.0001 ? 6 : 4);
}

function pValueText(p) {
  const text = formatPValue(p);
  return `p-value ${text.startsWith('<') ? '' : '= '}${text}`;
}

function pValueHelp() {
  return `<button type="button" class="help-btn" aria-label="About the p-value and significance" data-tooltip="${CONCEPTS.pvalue.tooltip}" onclick="openConcept('pvalue')">?</button>`;
}

function pChartScale() {
  return document.getElementById('pChartScale').value;
}

function plotPValue(p) {
  return p === null ? null : pChartScale() === 'logarithmic' ? Math.max(0.000001, p) : p;
}

function pValueAxis() {
  const logarithmic = pChartScale() === 'logarithmic';
  return {
    type: pChartScale(), reverse: true,
    title: { display: true, text: `p-value (${logarithmic ? 'log' : 'linear'} scale)`, font: { size: 11 } },
    min: logarithmic ? 0.000001 : 0, max: 1,
    ticks: { font: { size: 10 }, callback: value => Number(value).toFixed(6).replace(/\.?0+$/, '') || '0' },
  };
}

function onPChartScaleChange() {
  chartsDirty = true;
  renderCharts();
  renderDeepDive();
  if (!_restoring) history.replaceState(null, '', '?' + buildStateParams().toString());
}

function updateTestName() {
  const name = document.getElementById('testName').value.trim();
  document.title = name ? `${name} - Confidence Calculator` : 'Confidence Calculator - A/B Test Calculator';
  if (!_restoring) history.replaceState(null, '', '?' + buildStateParams().toString());
}

function renderEffectInterval(interval) {
  if (!interval || interval.uplift === null) return '<span class="effect-unavailable" aria-label="Interval undefined" data-tooltip="Relative uplift needs at least one control conversion.">-</span>';
  const { lower, upper, uplift } = interval;
  const open = !Number.isFinite(upper);
  const minimum = Math.min(0, lower, uplift);
  const maximum = Math.max(0, open ? uplift : upper);
  const span = Math.max(maximum - minimum, 0.01);
  const position = value => 8 + (value - minimum) / span * 84;
  const lowerPosition = position(lower);
  const upperPosition = open ? 96 : position(upper);
  const endpoint = value => `${value > 0 ? '+' : ''}${fmt(value * 100, 2)}%`;
  return `<div class="effect-axis${open ? ' effect-axis--open' : ''}" role="img" aria-label="Relative uplift ${endpoint(uplift)}; interval ${intervalText(interval)}" style="--zero:${position(0)}%;--lower:${lowerPosition}%;--range:${upperPosition - lowerPosition}%;--estimate:${position(uplift)}%">
    <span class="effect-axis-zero" aria-hidden="true">0%</span>
    <span class="effect-axis-range" aria-hidden="true"></span>
    <span class="effect-axis-point" aria-hidden="true"></span>
    <span class="effect-axis-labels" aria-hidden="true"><span>${endpoint(lower)}</span><span>${open ? '∞' : endpoint(upper)}</span></span>
  </div>`;
}

let chartsDirty = false;

function recalc() {
  const n1 = v('ctrl-n'), c1 = v('ctrl-c');
  const p1 = n1 > 0 ? c1/n1 : 0;
  document.getElementById('ctrl-rate').textContent = n1 > 0 && c1 >= 0 ? fmtPct(p1) : 'Undefined';

  const targetConf = parseFloat(document.querySelector('input[name="sConf"]:checked')?.value || '0.95');
  const power      = parseFloat(document.querySelector('input[name="sPower"]:checked')?.value || '0.80');
  const tails      = parseInt(document.querySelector('input[name="sType"]:checked')?.value || '2');
  const alpha      = 1 - targetConf;
  const alphaPct   = alpha * 100;
  const alphaDecimals = alphaPct >= 1 ? 0 : alphaPct >= 0.1 ? 1 : alphaPct >= 0.01 ? 2 : 3;
  const significanceHint = document.getElementById('significanceLevelHint');
  if (significanceHint) significanceHint.textContent = `p-value threshold: ${formatPValue(alpha)} (${fmt(alphaPct, alphaDecimals)}%; set by confidence level).`;
  const nVar       = variants.length;

  const adjAlpha = alpha / Math.max(1, nVar);
  const adjConf  = 1 - adjAlpha;
  const bfEl = document.getElementById('bonferroniAlert');
  if (nVar > 1 && (adjConf - targetConf) > 0.00001) {
    bfEl.style.display = 'block';
    const adjPct = adjConf * 100;
    const adjDecimals = adjPct >= 99.99 ? 4 : adjPct >= 99.9 ? 3 : adjPct >= 99 ? 2 : 1;
    const tPct = targetConf * 100;
    const targetDecimals = tPct % 1 === 0 ? 0 : tPct % 0.1 < 0.001 ? 1 : tPct % 0.01 < 0.0001 ? 2 : tPct % 0.001 < 0.00001 ? 3 : 4;
    document.getElementById('bfCount').textContent = nVar;
    document.getElementById('bfTargetConf').textContent = fmt(targetConf*100, targetDecimals)+'%';
    document.getElementById('bfAlpha').textContent = fmt(adjPct, adjDecimals)+'%';
  } else {
    bfEl.style.display = 'none';
  }

  variants.forEach(vr => {
    const n2 = v(vr.id+'-n'), c2 = v(vr.id+'-c');
    const p2 = n2 > 0 ? c2/n2 : 0;
    const rateEl = document.getElementById(vr.id+'-rate');
    if (rateEl) rateEl.textContent = n2 > 0 && c2 >= 0 ? fmtPct(p2) : 'Undefined';

    const slot = document.getElementById('result-' + vr.id);
    if (!slot) return;

    if (n1 < 1 || n2 < 1 || c1 < 0 || c2 < 0 || ![n1, n2, c1, c2].every(Number.isInteger) ||
      ['ctrl-n', 'ctrl-c', vr.id+'-n', vr.id+'-c'].some(id => document.getElementById(id).value === '')) {
      slot.innerHTML = `<div class="result-card result-invalid" role="status"><span>Check inputs</span><button type="button" class="help-btn" aria-label="Input requirements" data-tooltip="${CONCEPTS.inputs.tooltip}" onclick="openConcept('inputs')">?</button></div>`;
      return;
    }

    const { z, pp, se, count } = zTest(n1, c1, n2, c2);
    const pVal    = pFromZ(z, tails);
    const uplift  = p1 > 0 ? (p2-p1)/p1 : NaN;
    const absDiff = p2 - p1;
    const interval = relativeInterval(n1, c1, n2, c2, adjAlpha, tails);
    const significant = pVal < adjAlpha;
    const isWin  = significant && absDiff > 0;
    const isLoss = significant && absDiff < 0;
    const cardCls = isWin ? 'win' : isLoss ? 'loss' : '';

    let badgeCls, badgeTxt;
    if (isWin)       { badgeCls='badge-win';  badgeTxt='✓ Win'; }
    else if (isLoss) { badgeCls='badge-loss'; badgeTxt='✗ Loss'; }
    else             { badgeCls='badge-no';   badgeTxt='Not significant'; }

    const upCls = uplift > 0 ? 'pos' : uplift < 0 ? 'neg' : 'neu';
    const upSign = uplift > 0 ? '+' : '';

    slot.innerHTML = `
    <div class="result-card ${cardCls}">
      <div class="rc-head">
        <span class="rc-title">Result</span>
        <span class="rc-compact">${pValueText(pVal)} ${pValueHelp()}</span>
        <span class="badge ${badgeCls}">${badgeTxt}</span>
      </div>

      <div class="effect-summary" id="effect-${vr.id}">
        <div class="effect-metric">
          <span class="effect-label">Uplift <button type="button" class="help-btn" aria-label="About relative uplift" data-tooltip="${CONCEPTS.uplift.tooltip}" onclick="openConcept('uplift')">?</button></span>
          <strong class="effect-value ${upCls}">${Number.isFinite(uplift) ? upSign + fmt(uplift*100,2) + '%' : 'undefined'}</strong>
        </div>
        <div class="effect-metric">
          <span class="effect-label">Confidence interval <button type="button" class="help-btn" aria-label="About the confidence interval" data-tooltip="${+(adjConf*100).toFixed(5)}% ${tails === 1 ? 'one-sided lower bound' : 'confidence interval'}${nVar > 1 ? ' (Bonferroni-adjusted)' : ''}. ${CONCEPTS.interval.tooltip}" onclick="openConcept('interval')">?</button></span>
          ${renderEffectInterval(interval)}
        </div>
      </div>

      <div class="calc-chain">
        <div class="cc-step cc-input">
          <span class="cc-key">Control rate p₁</span>
          <span class="cc-val">${fmtPct(p1)}</span>
        </div>
        <div class="cc-step cc-input">
          <span class="cc-key">${vr.label} rate p₂</span>
          <span class="cc-val">${fmtPct(p2)}</span>
        </div>

        <div class="cc-divider"></div>

        <div class="cc-step cc-mid">
          <span class="cc-key">Pooled p̄ = (c₁+c₂)/(n₁+n₂)</span>
          <span class="cc-val">${fmtPct(pp)}</span>
        </div>
        <div class="cc-step cc-mid">
          <span class="cc-key">${count ? 'SE = √(p̄·(1/n₁+1/n₂)) <small>(count metric, rate &gt; 100%)</small>' : 'SE = √(p̄·(1−p̄)·(1/n₁+1/n₂))'}</span>
          <span class="cc-val">${fmt(se,6)}</span>
        </div>

        <div class="cc-divider"></div>

        <div class="cc-step cc-out">
          <span class="cc-key cc-key--out">Z = (p₂−p₁) / SE <button class="help-btn" data-tooltip="${CONCEPTS.zscore.tooltip}" onclick="openConcept('zscore')">?</button></span>
          <span class="cc-val cc-val--out">${fmt(z,4)}</span>
        </div>
        <div class="cc-step cc-out" id="significance-${vr.id}">
          <span class="cc-key cc-key--out">p-value (${tails===2?'two':'one'}-tailed) <button class="help-btn" data-tooltip="${CONCEPTS.pvalue.tooltip}" onclick="openConcept('pvalue')">?</button></span>
          <span class="cc-val cc-val--out">${formatPValue(pVal)}</span>
        </div>

        <div class="cc-divider"></div>

        <div class="cc-step cc-result">
          <span class="cc-key cc-key--result">Selected confidence level <button class="help-btn" data-tooltip="Long-run coverage of newly calculated intervals, not a probability that the variant wins." onclick="openConcept('confidence')">?</button></span>
          <span class="cc-val cc-val--result">${+(targetConf*100).toFixed(5)}%</span>
        </div>
        <div class="cc-step cc-result">
          <span class="cc-key cc-key--result">p-value threshold${nVar > 1 ? ' (Bonferroni)' : ''} ${pValueHelp()}</span>
          <span class="cc-val cc-val--result">${formatPValue(adjAlpha)}</span>
        </div>

        <div class="cc-divider"></div>

        <div class="cc-step cc-uplift">
          <span class="cc-key cc-key--result">Absolute diff.</span>
          <span class="cc-val cc-val--result ${upCls}">${upSign}${fmt(absDiff*100,2)} pp</span>
        </div>
      </div>

    </div>`;
  });

  chartsDirty = true;
  renderCharts();
  renderDeepDive();
  if (!_restoring) history.replaceState(null, '', '?' + buildStateParams().toString());
}

// ─────────────────────────────────────────────────────────────────────────────
// CHARTS
// ─────────────────────────────────────────────────────────────────────────────

let cConf = null, cVis = null, cPowerVis = null, cPowerTime = null;

// Confidence (in %) for n1 / n2 visitors in control / variant, if the true rates are p1 / p2
function confFromN(n1, n2, p1, p2, tails) {
  const count = isCountMetric(p1, p2);
  if (p1 <= 0 || p2 <= 0 || (!count && p2 >= 1) || !(n1 > 0) || !(n2 > 0)) return 0;
  const pp = (p1 * n1 + p2 * n2) / (n1 + n2);
  const se = Math.sqrt(rateVariance(pp, count) * (1 / n1 + 1 / n2));
  if (!(se > 0)) return 0;
  const z = (p2 - p1) / se;
  return Math.max(0, Math.min(100, (1 - pFromZ(z, tails)) * 100));
}

// Chance (in %) that a test with n1 / n2 visitors detects the assumed effect
function powerFromN(n1, n2, p1, p2, alpha, tails) {
  const count = isCountMetric(p1, p2);
  if (p1 <= 0 || p2 < 0 || (!count && p2 > 1) || !(n1 > 0) || !(n2 > 0)) return null;
  const se = Math.sqrt(rateVariance(p1, count) / n1 + rateVariance(p2, count) / n2);
  if (!(se > 0)) return null;
  const pooled = (p1*n1 + p2*n2)/(n1+n2);
  const cutoff = invNorm(1 - alpha / tails) * Math.sqrt(rateVariance(pooled, count)*(1/n1+1/n2));
  const difference = p2 - p1;
  return 100 * (1 - normalCDF((cutoff - difference)/se) + (tails === 2 ? normalCDF((-cutoff - difference)/se) : 0));
}

// Smallest (fractional) time unit where a growing metric f reaches target, or null within cap
function solveUnit(f, target, cap) {
  const ok = u => (f(u) ?? -Infinity) >= target;
  if (!ok(cap)) return null;
  let lo = 0, hi = cap;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
  return hi;
}

// At most ~400 x positions from 1 to end
function unitGrid(end) {
  const step = Math.max(1, Math.ceil(end / 400));
  const out = [];
  for (let u = 1; u < end; u += step) out.push(u);
  out.push(end);
  return out;
}

function projectedPValue(n1, c1, n2, c2, daily1, daily2, extraDays, uplift, tails) {
  if (!(n1 > 0) || !(n2 > 0) || c1 < 0 || c2 < 0 || extraDays < 0) return null;
  const controlRate = c1 / n1;
  const variantRate = controlRate * (1 + uplift);
  if (variantRate < 0 || (!isCountMetric(controlRate, c2 / n2) && variantRate > 1)) return null;
  const result = zTest(n1 + daily1 * extraDays, c1 + daily1 * extraDays * controlRate,
    n2 + daily2 * extraDays, c2 + daily2 * extraDays * variantRate);
  return Number.isFinite(result.z) ? pFromZ(result.z, tails) : null;
}

function renderCharts() {
  updateRail();
  if (!chartsDirty) return;
  chartsDirty = false;

  const totalVis      = parseFloat(document.getElementById('sTotalVis').value) || 1000;
  const since         = Math.max(1, parseInt(document.getElementById('scSince').value) || 1);
  const upliftRaw     = parseFloat(document.getElementById('scUplift').value);
  const expectedUplift = (upliftRaw || 0) / 100;
  const power         = parseFloat(document.querySelector('input[name="sPower"]:checked')?.value || '0.80');
  const tails         = parseInt(document.querySelector('input[name="sType"]:checked')?.value || '2');
  const familyConf    = parseFloat(document.querySelector('input[name="sConf"]:checked')?.value || '0.95');
  const targetConf    = 1 - (1 - familyConf) / Math.max(1, variants.length);

  // Base rate always from control group
  const ctrlN = v('ctrl-n'), ctrlC = v('ctrl-c');
  const p1 = ctrlN > 0 ? ctrlC / ctrlN : 0;
  const p2 = p1 * (1 + expectedUplift);

  // Projections start from the visitors collected so far and continue at the traffic basis:
  // recent daily traffic (deep dive data) or the average since the start.
  const forecastVariant = variants.reduce((selected, candidate) => {
    const candidateP = pFromZ(zTest(ctrlN, ctrlC, v(candidate.id + '-n'), v(candidate.id + '-c')).z, tails);
    const selectedP = selected ? pFromZ(zTest(ctrlN, ctrlC, v(selected.id + '-n'), v(selected.id + '-c')).z, tails) : -1;
    return !selected || !Number.isFinite(candidateP) || candidateP > selectedP ? candidate : selected;
  }, null);
  const N1 = ctrlN, N2 = forecastVariant ? v(forecastVariant.id + '-n') : 0;
  const C2 = forecastVariant ? v(forecastVariant.id + '-c') : 0;
  const observedUplift = p1 > 0 && N2 > 0 ? (C2 / N2) / p1 - 1 : 0;
  const recent = deepRecentRates();
  let f1, f2, fTotal, basisTxt;
  if (recent) {
    f1 = recent.rates[0];
    f2 = recent.rates[variants.indexOf(forecastVariant) + 1];
    fTotal = sum(recent.rates);
    basisTxt = `${recent.all ? 'all' : 'last'} ${recent.days} ${recent.days === 1 ? 'day' : 'days'} · ${Math.round(fTotal).toLocaleString()} / day`;
  } else {
    f1 = N1 / since; f2 = N2 / since; fTotal = totalVis / since;
    basisTxt = `average since start · ${Math.round(fTotal).toLocaleString()} / day`;
  }
  const planningN2 = variants.length ? Math.min(...variants.map(variant => v(variant.id + '-n'))) : 0;
  const planningF2 = recent ? Math.min(...recent.rates.slice(1)) : planningN2 / since;
  const nAt = u => (u <= since ? [u * N1 / since, u * planningN2 / since] : [N1 + (u - since) * f1, planningN2 + (u - since) * planningF2]);
  const totalAt = u => (u <= since ? u * totalVis / since : totalVis + (u - since) * fTotal);
  const evidenceAt = (u, uplift = observedUplift, multiplier = 1) => projectedPValue(
    N1, ctrlC, N2, C2, f1 * multiplier, f2 * multiplier, Math.max(0, u - since), uplift, tails);
  const confAt = u => { const p = evidenceAt(u); return p === null ? null : (1 - p) * 100; };
  const powerAt = u => powerFromN(...nAt(u), p1, p2, 1 - targetConf, tails);
  document.getElementById('currentPower').textContent = powerAt(since) === null ? 'Power unavailable for these assumptions' : `Calculated power: ${fmt(powerAt(since),1)}% for the assumed ${fmt(expectedUplift*100,1)}% relative effect and ${N1.toLocaleString()} / ${planningN2.toLocaleString()} visitors (control / smallest variant).`;

  const hasEffect = p1 > 0 && expectedUplift !== 0;
  const CAP = since + 100000;
  const unitsFor = pw => (hasEffect ? solveUnit(powerAt, pw * 100, CAP) : null);
  const reqUnitsExact = unitsFor(power);
  const reqUnit = reqUnitsExact ? Math.max(1, Math.ceil(reqUnitsExact)) : null;

  const confAtSince = confAt(since);
  const crossingFor = (uplift = observedUplift, multiplier = 1) => {
    if (evidenceAt(since) === null) return null;
    if (evidenceAt(since) <= 1 - targetConf) return since;
    if (uplift === 0 || (tails === 1 && uplift < 0)) return null;
    const extra = solveUnit(days => {
      const p = evidenceAt(since + days, uplift, multiplier);
      return p === null ? null : 1 - p;
    }, targetConf, CAP - since);
    return extra === null ? null : since + extra;
  };
  const crossExact = crossingFor();
  const crossUnit = crossExact ? Math.max(1, Math.ceil(crossExact)) : null;

  const horizon = Math.max(since * 4, 100);
  const end = horizon;
  const units = [since, ...unitGrid(end).filter(day => day > since)];
  const plotP = plotPValue;
  const pText = formatPValue;
  const direction = observedUplift < 0 ? 'decrease' : 'increase';
  const crossingText = crossing => crossing === null || crossing > horizon ? `Not within ${horizon - since} more days`
    : crossing <= since ? `Significant ${direction}` : `Day ${Math.ceil(crossing)} (+${Math.ceil(crossing) - since} days)`;

  // Stat summary row
  const statEl = document.getElementById('scenStatRow');
  if (evidenceAt(since) !== null) {
    // Visitors needed (overall, at the current split) until the target power is reached
    let sampleDisplay = '-';
    if (reqUnit) {
      const when = reqUnit <= since
        ? `<span class="pos">reached</span> by day <strong>${reqUnit.toLocaleString()}</strong>`
        : `day <strong>${reqUnit.toLocaleString()}</strong> (${(reqUnit - since).toLocaleString()} more days)`;
      sampleDisplay = `${Math.round(totalAt(reqUnitsExact)).toLocaleString()} visitors · ${when}`;
    }

    statEl.innerHTML = `
      <div class="scen-stat">
        <span class="scen-stat-label">Traffic basis</span>
        <span class="scen-stat-val" title="Traffic per time unit used for everything after now">${basisTxt}</span>
      </div>
      <div class="scen-stat">
        <span class="scen-stat-label">${forecastVariant.label} · day ${since} ${pValueHelp()}</span>
        <span class="scen-stat-val ${confAtSince >= targetConf*100 ? (observedUplift < 0 ? 'neg' : 'pos') : ''}">${pValueText(evidenceAt(since))} · threshold ${pText(1-targetConf)}</span>
      </div>
      <div class="scen-stat">
        <span class="scen-stat-label">Power ${fmt(power*100,0)}% · assumed ${fmt(upliftRaw,1)}% effect</span>
        <span class="scen-stat-val" title="Overall visitors at the current split">${sampleDisplay}</span>
      </div>
      <div class="scen-stat">
        <span class="scen-stat-label">Same pace · significant ${direction}</span>
        <span class="scen-stat-val" title="Conditional extrapolation, not a probability or stopping rule. Future traffic and conversion rates are held constant. With several variants, the comparison with the largest current p-value is shown; thresholds are Bonferroni-adjusted.">${crossingText(crossExact)}</span>
      </div>`;
  } else {
    statEl.innerHTML = `<div class="scen-stat"><span class="scen-stat-label">Add a variant with conversions to see the projection.</span></div>`;
  }

  // ── Future effect scenarios ───────────────────────────────────────────────
  const scenarioEffects = [
    { label: 'No future effect (0%)', uplift: 0, color: '#7c8798', dash: [3, 3] },
    { label: `Observed pace (${fmt(observedUplift*100,3)}%)`, uplift: observedUplift, color: '#4f78d6', dash: [] },
    { label: `Planned effect (${fmt(upliftRaw,1)}%)`, uplift: expectedUplift, color: '#4e9e7e', dash: [6, 3] },
    { label: `2× planned (${fmt(expectedUplift*200,1)}%)`, uplift: expectedUplift * 2, color: '#c79a4f', dash: [2, 3] },
  ].filter((scenario, index, scenarios) => scenarios.findIndex(item => Math.abs(item.uplift - scenario.uplift) < 0.0000001) === index);
  const endVis = horizon;
  const visUnits = units;

  const scenarioDatasets = scenarioEffects.map((scenario, index) => {
    return {
      label: scenario.label,
      data: visUnits.map(day => plotP(evidenceAt(day, scenario.uplift))),
      borderColor: scenario.color,
      backgroundColor: 'transparent',
      tension: 0, pointRadius: 0,
      borderWidth: scenario.uplift === observedUplift ? 2.5 : 1.5,
      borderDash: scenario.dash,
      fill: false, order: 10 + index,
    };
  });

  if (cVis) cVis.destroy();
  cVis = new Chart(document.getElementById('cVis'), {
    type: 'line',
    data: {
      datasets: [
        {
          label: `p-value threshold = ${pText(1-targetConf)}`,
          data: visUnits.map(u => ({ x: u, y: 1 - targetConf })),
          borderColor: '#4e9e7e', borderWidth: 1.5, borderDash: [6, 4],
          pointRadius: 0, fill: false, order: 99,
        },
        ...scenarioDatasets.map(ds => ({ ...ds, data: ds.data.map((y, i) => ({ x: visUnits[i], y })) })),
        { label: `Now · day ${since}`, data: [{ x: since, y: plotP(evidenceAt(since)) }],
          backgroundColor: '#c79a4f', borderColor: '#c79a4f', pointRadius: 6, showLine: false, order: 1 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      parsing: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            boxWidth: 10, padding: 8, font: { size: 10 },
            filter: item => !item.text.startsWith('_'),
          }
        },
        tooltip: {
          callbacks: {
            title: items => (items.length ? `Day ${Math.round(items[0].parsed.x).toLocaleString()}` : ''),
            label: c => {
              if (c.dataset.label.startsWith('_')) return null;
              if (c.parsed.y === null) return null;
              const p = c.datasetIndex === 0 ? 1 - targetConf :
                evidenceAt(c.parsed.x, scenarioEffects[c.datasetIndex - 1]?.uplift ?? observedUplift);
              return `${c.dataset.label}: ${pValueText(p)}`;
            },
          },
          filter: item => !item.dataset.label.startsWith('_'),
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Day since test start', font: { size: 11 } },
          ticks: { maxTicksLimit: 12, font: { size: 10 } },
          min: since, max: endVis,
        },
        y: pValueAxis()
      }
    }
  });

  const confCrossDataset = crossUnit && crossUnit <= horizon ? [{
    label: `Target day ${crossUnit}`,
    data: [{ x: crossUnit, y: 1 }, { x: crossUnit, y: 1 - targetConf }],
    borderColor: 'rgba(78,158,126,0.7)',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderDash: [3, 3],
    pointRadius: [0, 5],
    pointBackgroundColor: '#4e9e7e',
    pointBorderColor: 'transparent',
    showLine: true, fill: false, tension: 0, order: 5,
  }] : [];

  if (cConf) cConf.destroy();
  cConf = new Chart(document.getElementById('cConf'), {
    type: 'line',
    data: {
      datasets: [
        {
          label: `Same observed pace (${fmt(observedUplift*100,3)}%)`,
          data: units.map(u => ({ x: u, y: plotP(evidenceAt(u)) })),
          borderColor: '#4f78d6',
          backgroundColor: 'rgba(79,120,214,0.08)',
          fill: false, tension: 0, pointRadius: 0, borderWidth: 2, order: 10,
        },
        {
          label: `p-value threshold = ${pText(1-targetConf)}`,
          data: units.map(u => ({ x: u, y: 1 - targetConf })),
          borderColor: '#4e9e7e', borderWidth: 2, borderDash: [6, 4],
          pointRadius: 0, fill: false, order: 20,
        },
        {
          label: `Now · day ${since}`,
          data: [{ x: since, y: plotP(evidenceAt(since)) }],
          borderColor: 'rgba(199,154,79,0.8)',
          backgroundColor: '#c79a4f',
          pointRadius: 6, pointHoverRadius: 8,
          showLine: false, fill: false, order: 4,
        },
        ...confCrossDataset,
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      parsing: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            boxWidth: 10, padding: 8, font: { size: 10 },
            filter: item => !item.text.startsWith('_'),
          }
        },
        tooltip: {
          callbacks: {
            title: items => (items.length ? `Day ${Math.round(items[0].parsed.x).toLocaleString()}` : ''),
            label: c => {
              if (c.dataset.label.startsWith('_')) return null;
              return c.parsed.y !== null ? `${c.dataset.label}: ${pValueText(c.datasetIndex === 1 || c.datasetIndex === 3 ? c.parsed.y : evidenceAt(c.parsed.x))}` : null;
            },
          },
          filter: item => !item.dataset.label.startsWith('_'),
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Day since test start', font: { size: 11 } },
          ticks: { maxTicksLimit: 12, font: { size: 10 } },
          min: since, max: end,
        },
        y: pValueAxis()
      }
    }
  });

  // ── Power planning charts ──────────────────────────────────────────────
  const powerLevels = [0.70, 0.75, 0.80, 0.85, 0.90, 0.95];
  const powerLabels = powerLevels.map(p => `${fmt(p*100,0)}%`);

  // Chart 3: Overall visitors needed at each power level (at the current split)
  const unitsByPower = powerLevels.map(p => unitsFor(p));
  const visitorsByPower = unitsByPower.map(u => (u ? totalAt(u) : null));

  if (cPowerVis) cPowerVis.destroy();
  cPowerVis = new Chart(document.getElementById('cPowerVis'), {
    type: 'bar',
    data: {
      labels: powerLabels,
      datasets: [{
        label: 'Visitors needed',
        data: visitorsByPower,
        borderColor: '#4f78d6',
        backgroundColor: 'rgba(79,120,214,0.2)',
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => c.raw !== null
              ? `${Math.round(c.raw).toLocaleString()} visitors (unit ${Math.max(1, Math.ceil(unitsByPower[c.dataIndex])).toLocaleString()})`
              : null
          }
        }
      },
      scales: {
        y: {
          title: { display: true, text: 'Visitors (overall)', font: { size: 11 } },
          ticks: { font: { size: 10 }, callback: v => Math.round(v).toLocaleString() }
        },
        x: {
          title: { display: true, text: 'Power level', font: { size: 11 } },
          ticks: { font: { size: 10 } }
        }
      }
    }
  });

  // Chart 4: Power over time - continuous curve up to (and past) now
  const reach95 = unitsFor(0.95);
  const endP = Math.min(Math.max(10, Math.ceil(Math.max(since, reach95 ?? since * 2, reqUnit ?? 0) * 1.2)), horizon);
  const powerCurve = hasEffect ? unitGrid(endP).map(u => ({ x: u, y: powerAt(u) })) : [];

  const powerCrossDataset = reqUnit ? [{
    label: '_power_cross',
    data: [{ x: reqUnit, y: 0 }, { x: reqUnit, y: power * 100 }],
    borderColor: 'rgba(78,158,126,0.7)',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderDash: [3, 3],
    pointRadius: [0, 5],
    pointBackgroundColor: '#4e9e7e',
    pointBorderColor: 'transparent',
    showLine: true, fill: false, tension: 0, order: 5,
  }] : [];

  if (cPowerTime) cPowerTime.destroy();
  cPowerTime = new Chart(document.getElementById('cPowerTime'), {
    type: 'line',
    data: {
      datasets: [{
        label: 'Power',
        data: powerCurve,
        borderColor: '#7c3aed',
        backgroundColor: 'rgba(124,58,237,0.1)',
        fill: 'origin',
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
        order: 10,
      }, {
        label: `Target ${fmt(power * 100, 0)}%`,
        data: [{ x: 1, y: power * 100 }, { x: endP, y: power * 100 }],
        borderColor: '#4e9e7e', borderWidth: 1.5, borderDash: [6, 4],
        pointRadius: 0, fill: false, order: 20,
      }, {
        label: `Now (unit ${since})`,
        data: [{ x: since, y: 0 }, { x: since, y: 100 }],
        borderColor: '#c79a4f',
        backgroundColor: '#c79a4f',
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 0,
        fill: false,
        order: 4,
      }, ...powerCrossDataset]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      parsing: false,
      layout: { padding: { top: 8, right: 8 } },
      plugins: {
        legend: {
          position: 'top',
          labels: { boxWidth: 12, padding: 14, font: { size: 11 }, filter: item => !item.text.startsWith('_') }
        },
        tooltip: {
          filter: item => item.datasetIndex === 0,
          callbacks: {
            title: items => (items.length ? `Unit ${Math.round(items[0].parsed.x).toLocaleString()}` : ''),
            label: c => `${fmt(c.parsed.y, 1)}% power`
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: 1, max: endP,
          title: { display: true, text: 'Time units since test start', font: { size: 11 } },
          ticks: { maxTicksLimit: 12, font: { size: 10 }, precision: 0, callback: v => Math.round(v).toLocaleString() }
        },
        y: {
          min: 0, max: 100,
          title: { display: true, text: 'Power (%)', font: { size: 11 } },
          ticks: { font: { size: 10 }, stepSize: 20, callback: v => `${v}%` }
        }
      }
    }
  });
}

// Apply IDH chart defaults
Chart.defaults.font.family = "'IBM Plex Mono', monospace";
Chart.defaults.font.size = 10;
Chart.defaults.color = '#6f7689';
Chart.defaults.borderColor = '#d7dbe6';

['scUplift', 'scSince'].forEach(id => {
  document.getElementById(id).addEventListener('input', function(){
    this.dataset.manual = '1';
    // Keep the start date in step with the typed duration (in days)
    if (id === 'scSince') syncDateFromSince();
    chartsDirty = true;
    renderCharts();
    if (!_restoring) history.replaceState(null, '', '?' + buildStateParams().toString());
  });
});

// ── Start date → "running since" in days ────────────────────────────────────

const SINCE_HINT_DEFAULT = document.getElementById('scSinceHint').textContent;

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseLocalDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return isNaN(d) ? null : d;
}

// Whole calendar days from start to today, at least 1 (a test started today counts as day 1)
function daysSince(str) {
  const start = parseLocalDate(str);
  if (!start) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.round((today - start) / 86400000));
}

function setSinceHint(days, dateStr) {
  const label = parseLocalDate(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  document.getElementById('scSinceHint').textContent = `${days} ${days === 1 ? 'day' : 'days'} since ${label} - time units are days`;
}

function applySinceDate() {
  const dateEl = document.getElementById('scSinceDate');
  const days = daysSince(dateEl.value);
  if (days === null) { document.getElementById('scSinceHint').textContent = SINCE_HINT_DEFAULT; return false; }
  const el = document.getElementById('scSince');
  el.value = days;
  el.dataset.manual = '1';
  setSinceHint(days, dateEl.value);
  return true;
}

// Number → date: start date = today minus the typed number of days
function syncDateFromSince() {
  const days = parseInt(document.getElementById('scSince').value);
  if (!(days >= 1)) { clearSinceDate(); return; }
  const now = new Date();
  const start = localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
  document.getElementById('scSinceDate').value = start;
  setSinceHint(days, start);
}

function clearSinceDate() {
  document.getElementById('scSinceDate').value = '';
  document.getElementById('scSinceHint').textContent = SINCE_HINT_DEFAULT;
}

function onSinceDateChange() {
  applySinceDate();
  chartsDirty = true;
  renderCharts();
  if (!_restoring) history.replaceState(null, '', '?' + buildStateParams().toString());
}

document.getElementById('scSinceDate').max = localDateStr(new Date());

// ─────────────────────────────────────────────────────────────────────────────
// SHARE / RESTORE STATE
// ─────────────────────────────────────────────────────────────────────────────

function buildStateParams() {
  const p = new URLSearchParams();
  const name = document.getElementById('testName').value.trim();
  if (name) p.set('name', name);
  p.set('scale', pChartScale());
  p.set('vis',   document.getElementById('sTotalVis').value);
  p.set('conf',  document.querySelector('input[name="sConf"]:checked')?.value || '0.95');
  p.set('pwr',   document.querySelector('input[name="sPower"]:checked')?.value || '0.80');
  p.set('type',  document.querySelector('input[name="sType"]:checked')?.value || '2');
  p.set('cd',    document.getElementById('ctrl-dist').value);
  p.set('cn',    document.getElementById('ctrl-n').value);
  p.set('cc',    document.getElementById('ctrl-c').value);
  p.set('since', document.getElementById('scSince').value);
  const start = document.getElementById('scSinceDate').value;
  if (start) p.set('start', start);
  p.set('scupl', document.getElementById('scUplift').value);
  p.set('theme', document.documentElement.getAttribute('data-theme') || 'light');
  p.set('calc',  document.getElementById('calcToggle')?.dataset.state || 'off');
  p.set('proj',  document.getElementById('projToggle')?.checked ? '1' : '0');
  p.set('sb',    document.querySelector('.dashboard')?.classList.contains('sidebar-collapsed') ? '1' : '0');
  p.set('dd',    deepEnabled() ? '1' : '0');
  p.set('rw',    deepWindowRaw());
  p.set('nv',    variants.length);
  variants.forEach((vr, i) => {
    p.set(`vd${i}`, document.getElementById(vr.id + '-dist').value);
    p.set(`vn${i}`, document.getElementById(vr.id + '-n').value);
    p.set(`vc${i}`, document.getElementById(vr.id + '-c').value);
  });
  // Daily data last: it's by far the longest part of the link
  const dz = deepData ? deepEncoded : deepPending;
  if (dz) p.set('dz', dz);
  return p;
}

function shareState() {
  const url = location.origin + location.pathname + '?' + buildStateParams().toString();
  navigator.clipboard.writeText(url).then(() => {
    const t = document.getElementById('shareToast');
    t.textContent = url.length > URL_WARN_CHARS
      ? `Link copied - ${fmt(url.length / 1024, 1)} KB, some apps cut links this long`
      : 'Link copied!';
    t.classList.add('share-toast--visible');
    setTimeout(() => t.classList.remove('share-toast--visible'), url.length > URL_WARN_CHARS ? 4500 : 2200);
  });
}

let _restoring = false;

function restoreFromParams() {
  const p = new URLSearchParams(location.search);
  document.getElementById('testName').value = p.get('name') || '';
  document.getElementById('pChartScale').value = p.get('scale') === 'logarithmic' ? 'logarithmic' : 'linear';
  _restoring = true;
  updateTestName();
  _restoring = false;
  if (!p.has('vis')) return false;

  _restoring = true;

  document.getElementById('sTotalVis').value = p.get('vis');

  const conf = p.get('conf');
  if (conf) document.querySelector(`input[name="sConf"][value="${conf}"]`)?.click();
  const pwr = p.get('pwr');
  if (pwr) document.querySelector(`input[name="sPower"][value="${pwr}"]`)?.click();
  const type = p.get('type');
  if (type) document.querySelector(`input[name="sType"][value="${type}"]`)?.click();

  if (p.has('calc')) {
    // Legacy binary links: 0 = summary, 1 = full
    const raw = p.get('calc');
    setCalcMode(raw === '0' ? 'on' : raw === '1' ? 'full' : raw, true);
  }
  if (p.get('sb') === '1') toggleSidebar(true, true);
  if (p.has('proj')) {
    const showProj = p.get('proj') !== '0';
    const toggle = document.getElementById('projToggle');
    if (toggle) { toggle.checked = showProj; toggleProjection(showProj, true); }
  }
  const rw = document.querySelector(`input[name="sWindow"][value="${p.get('rw')}"]`);
  if (rw) rw.checked = true;
  if (p.get('dd') === '1') {
    document.getElementById('deepToggle').checked = true;
    toggleDeepDive(true, true);
  }

  if (p.has('since')) { const el = document.getElementById('scSince'); el.value = p.get('since'); el.dataset.manual = '1'; }
  // A shared start date wins over the stored day count, so old links stay up to date
  if (p.has('start')) document.getElementById('scSinceDate').value = p.get('start');
  if (!p.has('start') || !applySinceDate()) syncDateFromSince();
  if (p.has('scupl')) { const el = document.getElementById('scUplift');el.value = p.get('scupl'); el.dataset.manual = '1'; }

  const nv = parseInt(p.get('nv')) || 0;
  for (let i = 0; i < nv; i++) addVariant();

  // Apply values only after all variants exist: addVariant() rebalances every group to an even split
  variants.forEach((vr, i) => {
    setKnobDisplay(vr.id, parseInt(p.get(`vd${i}`)) || 50);
    document.getElementById(vr.id + '-n').value = p.get(`vn${i}`) || 5000;
    document.getElementById(vr.id + '-c').value = p.get(`vc${i}`) || 0;
  });
  setKnobDisplay('ctrl', parseInt(p.get('cd')) || 50);
  document.getElementById('ctrl-n').value = p.get('cn') || 5000;
  document.getElementById('ctrl-c').value = p.get('cc') || 250;
  document.getElementById('sTotalVis').value = p.get('vis');

  // Daily data is compressed, so it arrives a moment later; keep it in the URL meanwhile
  const dz = p.get('dz');
  if (dz) deepPending = dz;

  _restoring = false;
  recalc();

  if (dz) {
    decodeDeepData(dz)
      .then(data => {
        setDeepData(data, dz);
        chartsDirty = true;
        renderCharts();
        renderDeepDive();
        history.replaceState(null, '', '?' + buildStateParams().toString());
      })
      .catch(() => {
        deepPending = '';
        document.getElementById('deepInfo').textContent = 'The daily data in this link could not be read.';
      });
  }
  return true;
}

function copyChart(chartId) {
  const canvas = document.getElementById(chartId);
  const btn = event?.target?.closest('.chart-copy-btn');
  if (!canvas) return;

  canvas.toBlob(blob => {
    if (!blob) {
      alert('Failed to capture chart');
      return;
    }

    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      .then(() => {
        if (btn) {
          const origContent = btn.innerHTML;
          btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
          setTimeout(() => btn.innerHTML = origContent, 1500);
        }
      })
      .catch(err => {
        console.error('Copy failed:', err);
        alert('Failed to copy chart. Your browser may not support this feature.');
      });
  }, 'image/png');
}

function toggleProjection(show, skipHistory) {
  const hidden = !show;
  document.getElementById('pChartControls').classList.toggle('proj-hidden', !show && !deepEnabled());
  document.getElementById('secProjection')?.classList.toggle('proj-hidden', hidden);
  document.getElementById('powerChartsRow')?.classList.toggle('proj-hidden', hidden);
  document.getElementById('powerRadioGroup')?.classList.toggle('proj-hidden', hidden);
  document.getElementById('projectionSidebarLabel')?.classList.toggle('proj-hidden', hidden);
  document.getElementById('projectionSidebar')?.classList.toggle('proj-hidden', hidden);
  updateRail();
  updateJumpNav();
  if (!skipHistory && !_restoring) history.replaceState(null, '', '?' + buildStateParams().toString());
}

// Result detail level: off = one-line result, on = summary, full = summary + calculation steps
const CALC_MODES = ['off', 'on', 'full'];
const CALC_MODE_LABELS = { off: 'Off', on: 'On', full: 'Full' };

function setCalcMode(mode, skipHistory) {
  if (!CALC_MODES.includes(mode)) mode = 'off';
  const group = document.getElementById('calcToggle');
  group.dataset.state = mode;
  const radio = group.querySelector(`input[value="${mode}"]`);
  if (radio) radio.checked = true;
  document.getElementById('calcToggleState').textContent = CALC_MODE_LABELS[mode];
  const grid = document.getElementById('groupsGrid');
  grid.classList.toggle('calc-hidden', mode !== 'full');
  grid.classList.toggle('calc-collapsed', mode === 'off');
  if (!skipHistory && !_restoring) history.replaceState(null, '', '?' + buildStateParams().toString());
}

function toggleSidebar(collapse, skipHistory) {
  const dash = document.querySelector('.dashboard');
  const c = typeof collapse === 'boolean' ? collapse : !dash.classList.contains('sidebar-collapsed');
  dash.classList.toggle('sidebar-collapsed', c);
  const btn = document.getElementById('sidebarCollapseBtn');
  const txt = c ? 'Expand sidebar' : 'Collapse sidebar';
  btn.setAttribute('aria-label', txt);
  btn.title = txt;
  updateRail();
  positionCollapseHandle();
  if (!skipHistory && !_restoring) history.replaceState(null, '', '?' + buildStateParams().toString());
}

// Keep the collapse handle at the vertical middle of the visible part of the (sticky) sidebar
function positionCollapseHandle() {
  const btn = document.getElementById('sidebarCollapseBtn');
  const sb = document.getElementById('groupsSidebar');
  if (!btn || !sb) return;
  const r = sb.getBoundingClientRect();
  const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, window.innerHeight);
  btn.style.top = `${(top + bottom) / 2}px`;
}
window.addEventListener('scroll', positionCollapseHandle, { passive: true });
window.addEventListener('resize', positionCollapseHandle);

function updateRail() {
  const visEl = document.getElementById('railVis');
  if (!visEl) return;
  const vis = parseInt(document.getElementById('sTotalVis').value) || 0;
  visEl.textContent = vis.toLocaleString();

  const conf  = parseFloat(document.querySelector('input[name="sConf"]:checked')?.value || '0.95');
  const tails = document.querySelector('input[name="sType"]:checked')?.value || '2';
  const power = parseFloat(document.querySelector('input[name="sPower"]:checked')?.value || '0.80');
  const pct = x => `${+(x * 100).toFixed(3)}%`;
  const chips = [
    ['Conf', pct(conf)],
    ['Test', tails === '2' ? '2-tail' : '1-tail'],
  ];
  if (document.getElementById('projToggle')?.checked) {
    const since = document.getElementById('scSince').value;
    const upl = parseFloat(document.getElementById('scUplift').value);
    chips.push(
      ['Power', pct(power)],
      ['Since', since || '-'],
      ['Uplift', isFinite(upl) ? `${upl > 0 ? '+' : ''}${upl}%` : '-'],
    );
  }
  if (deepEnabled()) chips.push(['Basis', !deepData ? 'avg' : deepWindowRaw() === 'all' ? 'all' : `${deepWindowRaw()}d`]);
  document.getElementById('railChips').innerHTML = chips
    .map(([k, val]) => `<span class="rail-chip"><span class="rail-chip-k">${k}</span><span class="rail-chip-v">${val}</span></span>`)
    .join('');
}

// ── Sticky jump navigation ──────────────────────────────────────────────────

function jumpTargets() {
  return [...document.querySelectorAll('#jumpNav a')].map(a => ({ a, el: document.getElementById(a.getAttribute('href').slice(1)) }));
}

// Only list sections that are currently shown
function updateJumpNav() {
  jumpTargets().forEach(({ a, el }) => { a.hidden = !el || !!el.closest('.proj-hidden'); });
  highlightJumpNav();
}

function highlightJumpNav() {
  const navH = document.getElementById('jumpNav').offsetHeight;
  const shown = jumpTargets().filter(t => !t.a.hidden);
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
  let current = shown[0];
  shown.forEach(t => { if (t.el.getBoundingClientRect().top <= navH + 80) current = t; });
  if (atBottom && shown.length) current = shown[shown.length - 1];
  shown.forEach(t => t.a.classList.toggle('is-active', t === current));
}

document.getElementById('jumpNav').addEventListener('click', e => {
  const a = e.target.closest('a');
  if (!a) return;
  e.preventDefault();
  document.getElementById(a.getAttribute('href').slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
window.addEventListener('scroll', highlightJumpNav, { passive: true });

// Boot: restore from URL or render defaults
setCalcMode(document.getElementById('calcToggle').dataset.state, true);
toggleProjection(document.getElementById('projToggle').checked, true);
if (!restoreFromParams()) {
  addVariant();
  document.getElementById('v0-c').value = 280;
  syncDateFromSince();
  recalc();
}
positionCollapseHandle();
