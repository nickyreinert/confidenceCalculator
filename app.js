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

function zTest(n1, c1, n2, c2) {
  const p1 = c1/n1, p2 = c2/n2;
  const pp = (c1+c2)/(n1+n2);
  const se = Math.sqrt(pp*(1-pp)*(1/n1+1/n2));
  if (se === 0) return { z:0, p1, p2, pp, se };
  return { z:(p2-p1)/se, p1, p2, pp, se };
}

function pFromZ(z, tails) {
  return tails * (1 - normalCDF(Math.abs(z)));
}

function sampleSizePerGroup(baseRate, relLift, alpha, power) {
  const p1 = baseRate, p2 = baseRate*(1+relLift);
  if (p2<=0||p2>=1||p1<=0||p1>=1) return Infinity;
  const za = invNorm(1-alpha/2), zb = invNorm(power);
  return Math.ceil(Math.pow(za+zb,2)*(p1*(1-p1)+p2*(1-p2))/Math.pow(p2-p1,2));
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
          <input type="number" id="${id}-n" value="${visitorsEach}" min="1" oninput="onVisitorsChange('${id}')">
        </div>
        <div class="fg">
          <label>Conversions</label>
          <input type="number" id="${id}-c" value="270" min="0" oninput="recalc()">
        </div>
        <div class="fg">
          <label>Rate</label>
          <div class="rate-display" id="${id}-rate" style="color:${color}">—</div>
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
function fmt(n, d=2) { return isFinite(n) ? n.toFixed(d) : '—'; }
function fmtPct(n) { return fmt(n*100,2)+'%'; }

let chartsDirty = false;

function recalc() {
  const n1 = v('ctrl-n'), c1 = v('ctrl-c');
  const p1 = n1 > 0 ? c1/n1 : 0;
  document.getElementById('ctrl-rate').textContent = fmtPct(p1);

  const targetConf = parseFloat(document.querySelector('input[name="sConf"]:checked')?.value || '0.95');
  const power      = parseFloat(document.querySelector('input[name="sPower"]:checked')?.value || '0.80');
  const tails      = parseInt(document.querySelector('input[name="sType"]:checked')?.value || '2');
  const alpha      = 1 - targetConf;
  const nVar       = variants.length;

  const adjAlpha = alpha / nVar;
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

  let firstUplift = null;

  variants.forEach((vr, idx) => {
    const n2 = v(vr.id+'-n'), c2 = v(vr.id+'-c');
    const p2 = n2 > 0 ? c2/n2 : 0;
    const rateEl = document.getElementById(vr.id+'-rate');
    if (rateEl) rateEl.textContent = fmtPct(p2);

    const slot = document.getElementById('result-' + vr.id);
    if (!slot) return;

    if (n1 < 1 || n2 < 1 || c1 < 0 || c2 < 0) {
      slot.innerHTML = '';
      return;
    }

    const { z, pp, se } = zTest(n1, c1, n2, c2);
    const pVal    = pFromZ(z, tails);
    const conf    = 1 - pVal;
    const uplift  = p1 > 0 ? (p2-p1)/p1 : 0;
    const absDiff = p2 - p1;

    if (idx === 0) firstUplift = uplift;

    const isWin  = conf >= adjConf && uplift > 0;
    const isLoss = conf >= adjConf && uplift < 0;
    const isNear = !isWin && !isLoss && conf >= adjConf * 0.85;
    const cardCls = isWin ? 'win' : isLoss ? 'loss' : isNear ? 'inconclusive' : '';

    let badgeCls, badgeTxt;
    if (isWin)       { badgeCls='badge-win';  badgeTxt='✓ Win'; }
    else if (isLoss) { badgeCls='badge-loss'; badgeTxt='✗ Loss'; }
    else if (isNear) { badgeCls='badge-wait'; badgeTxt='⏳ Almost'; }
    else             { badgeCls='badge-no';   badgeTxt='— Pending'; }

    const confColor = isWin ? 'var(--success-500)' : isLoss ? 'var(--danger-500)' : isNear ? 'var(--warning-500)' : 'var(--text-faint)';
    const barW = Math.max(0, Math.min(100, conf*100));
    const upCls = uplift > 0 ? 'pos' : uplift < 0 ? 'neg' : 'neu';
    const upSign = uplift > 0 ? '+' : '';

    slot.innerHTML = `
    <div class="result-card ${cardCls}">
      <div class="rc-head">
        <span class="rc-title">${vr.label} vs Control</span>
        <span class="badge ${badgeCls}">${badgeTxt}</span>
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
          <span class="cc-key">SE = √(p̄·(1−p̄)·(1/n₁+1/n₂))</span>
          <span class="cc-val">${fmt(se,6)}</span>
        </div>

        <div class="cc-divider"></div>

        <div class="cc-step cc-out">
          <span class="cc-key cc-key--out">Z = (p₂−p₁) / SE <button class="help-btn" data-tooltip="${CONCEPTS.zscore.tooltip}" onclick="openConcept('zscore')">?</button></span>
          <span class="cc-val cc-val--out">${fmt(z,4)}</span>
        </div>
        <div class="cc-step cc-out">
          <span class="cc-key cc-key--out">p-value (${tails===2?'two':'one'}-tailed) <button class="help-btn" data-tooltip="${CONCEPTS.pvalue.tooltip}" onclick="openConcept('pvalue')">?</button></span>
          <span class="cc-val cc-val--out">${fmt(pVal,4)}</span>
        </div>

        <div class="cc-divider"></div>

        <div class="cc-step cc-result">
          <span class="cc-key cc-key--result">Confidence = 1 − p <button class="help-btn" data-tooltip="${CONCEPTS.confidence.tooltip}" onclick="openConcept('confidence')">?</button></span>
          <span class="cc-val cc-val--result" style="color:${confColor}">${fmt(conf*100,2)}%</span>
        </div>
        <div class="cc-step cc-result">
          <span class="cc-key cc-key--result">Threshold (${nVar}× Bonferroni) <button class="help-btn" data-tooltip="${CONCEPTS.bonferroni.tooltip}" onclick="openConcept('bonferroni')">?</button></span>
          <span class="cc-val cc-val--result">${fmt(adjConf*100,2)}%</span>
        </div>

        <div class="cc-divider"></div>

        <div class="cc-step cc-uplift">
          <span class="cc-key cc-key--result">Uplift (relative) <button class="help-btn" data-tooltip="${CONCEPTS.uplift.tooltip}" onclick="openConcept('uplift')">?</button></span>
          <span class="cc-val cc-val--result ${upCls}">${upSign}${fmt(uplift*100,2)}%</span>
        </div>
        <div class="cc-step cc-uplift">
          <span class="cc-key cc-key--result">Absolute diff.</span>
          <span class="cc-val cc-val--result ${upCls}">${upSign}${fmt(absDiff*100,2)} pp</span>
        </div>
      </div>

      <div class="bar-track" style="margin-top:var(--space-4)"><div class="bar-fill" style="width:${barW}%;background:${confColor}"></div></div>
      <div class="bar-labels"><span>0%</span><span style="color:${confColor};font-weight:700">${fmt(adjConf*100, adjConf*100 >= 99.9 ? 3 : adjConf*100 >= 99 ? 1 : 0)}% threshold</span><span>100%</span></div>
    </div>`;
  });

  const scUpl = document.getElementById('scUplift');
  if (!scUpl.dataset.manual && firstUplift !== null) scUpl.value = fmt(firstUplift*100, 1);
  // Mirror total visitors to scenario visitor field
  const scVis = document.getElementById('scVis');
  if (!scVis.dataset.manual) scVis.value = Math.round(v('sTotalVis'));

  chartsDirty = true;
  renderCharts();
  history.replaceState(null, '', '?' + buildStateParams().toString());
}

// ─────────────────────────────────────────────────────────────────────────────
// CHARTS
// ─────────────────────────────────────────────────────────────────────────────

let cConf = null, cVis = null;

function confAtUnit(unit, visPerUnit, p1, p2, tails) {
  if (p1 <= 0 || p2 <= 0 || p2 >= 1 || visPerUnit < 1) return 0;
  const n = unit * visPerUnit;
  const pp = (p1 + p2) / 2;
  const se = Math.sqrt(pp * (1 - pp) * (2 / n));
  if (se === 0) return 0;
  const z = (p2 - p1) / se;
  return Math.max(0, Math.min(100, (1 - pFromZ(z, tails)) * 100));
}

function renderCharts() {
  if (!chartsDirty) return;
  chartsDirty = false;

  const visPerUnit    = parseFloat(document.getElementById('scVis').value) || 1000;
  const since         = parseInt(document.getElementById('scSince').value) || 1;
  const upliftRaw     = parseFloat(document.getElementById('scUplift').value);
  const expectedUplift = (upliftRaw || 0) / 100;
  const power         = parseFloat(document.querySelector('input[name="sPower"]:checked')?.value || '0.80');
  const tails         = parseInt(document.querySelector('input[name="sType"]:checked')?.value || '2');
  const targetConf    = parseFloat(document.querySelector('input[name="sConf"]:checked')?.value || '0.95');

  // Base rate always from control group
  const ctrlN = v('ctrl-n'), ctrlC = v('ctrl-c');
  const p1 = ctrlN > 0 ? ctrlC / ctrlN : 0;
  const p2 = p1 * (1 + expectedUplift);

  // Project out far enough to show the target being crossed (max 500 units)
  const MAX_UNITS = 500;
  const confAtSince = confAtUnit(since, visPerUnit, p1, p2, tails);

  // Find unit where confidence crosses target
  let crossUnit = null;
  for (let u = since; u <= MAX_UNITS; u++) {
    if (confAtUnit(u, visPerUnit, p1, p2, tails) >= targetConf * 100) {
      crossUnit = u;
      break;
    }
  }

  const end = crossUnit ? Math.min(MAX_UNITS, Math.ceil(crossUnit * 1.25)) : MAX_UNITS;
  const units = Array.from({length: end}, (_, i) => i + 1);

  // Stat summary row
  const statEl = document.getElementById('scenStatRow');
  if (p1 > 0 && expectedUplift !== 0) {
    const crossTxt = crossUnit
      ? `reaches <strong>${fmt(targetConf*100,0)}%</strong> at unit <strong>${crossUnit}</strong> (${crossUnit - since} more)`
      : `does not reach <strong>${fmt(targetConf*100,0)}%</strong> within ${MAX_UNITS} units`;

    // Calculate required sample size per group for context
    const reqSample = sampleSizePerGroup(p1, expectedUplift, 1-targetConf, power);
    const sampleDisplay = isFinite(reqSample)
      ? `${Math.round(reqSample).toLocaleString()} visitors`
      : '—';

    statEl.innerHTML = `
      <div class="scen-stat">
        <span class="scen-stat-label">Control rate</span>
        <span class="scen-stat-val">${fmtPct(p1)}</span>
      </div>
      <div class="scen-stat">
        <span class="scen-stat-label">Uplift applied</span>
        <span class="scen-stat-val">${upliftRaw > 0 ? '+' : ''}${fmt(upliftRaw,1)}% → ${fmtPct(p2)}</span>
      </div>
      <div class="scen-stat">
        <span class="scen-stat-label">Confidence now</span>
        <span class="scen-stat-val ${confAtSince >= targetConf*100 ? 'pos' : ''}">${fmt(confAtSince,2)}%</span>
      </div>
      <div class="scen-stat">
        <span class="scen-stat-label">Power ${fmt(power*100,0)}% needs</span>
        <span class="scen-stat-val" title="Sample size per group at power level">${sampleDisplay}</span>
      </div>
      <div class="scen-stat">
        <span class="scen-stat-label">Projection</span>
        <span class="scen-stat-val">${crossTxt}</span>
      </div>`;
  } else {
    statEl.innerHTML = `<div class="scen-stat"><span class="scen-stat-label">Add a variant with conversions to see the projection.</span></div>`;
  }

  // ── Traffic sensitivity chart ──────────────────────────────────────────────
  const visMultipliers = [0.25, 0.5, 1, 1.5, 2];
  const visColors      = ['#cf6b6b', '#c79a4f', '#4f78d6', '#7c3aed', '#4e9e7e'];

  // Pre-compute crossing unit for each volume
  const visCrossings = visMultipliers.map(m => {
    const vol = Math.round(visPerUnit * m);
    if (p1 <= 0 || expectedUplift === 0) return null;
    for (let u = 1; u <= MAX_UNITS; u++) {
      if (confAtUnit(u, vol, p1, p2, tails) >= targetConf * 100) return u;
    }
    return null;
  });

  // X range: far enough that the slowest crossing is visible with padding
  const maxCross = visCrossings.reduce((mx, c) => c ? Math.max(mx, c) : mx, crossUnit || 30);
  const endVis = Math.min(MAX_UNITS, Math.ceil(maxCross * 1.3));
  const visUnits = Array.from({length: endVis}, (_, i) => i + 1);

  // Curve datasets
  const curveDatasets = visMultipliers.map((m, i) => {
    const vol = Math.round(visPerUnit * m);
    return {
      label: `${vol.toLocaleString()} / unit`,
      data: visUnits.map(u => p1 > 0 && expectedUplift !== 0 ? confAtUnit(u, vol, p1, p2, tails) : null),
      borderColor: visColors[i],
      backgroundColor: 'transparent',
      tension: 0.4, pointRadius: 0,
      borderWidth: m === 1 ? 2.5 : 1.5,
      borderDash: m === 1 ? [] : m < 1 ? [4, 3] : [],
      fill: false, order: 10 + i,
    };
  });

  // Vertical crossing-point lines: each is a two-point segment at x = crossUnit
  // rendered as a scatter with showLine:true connecting {x, 0} → {x, targetConf*100}
  const crossingDatasets = visMultipliers.map((m, i) => {
    const cu = visCrossings[i];
    if (!cu) return null;
    return {
      label: `_cross_${i}`,   // leading _ = hidden from legend via filter below
      data: [{ x: cu, y: 0 }, { x: cu, y: targetConf * 100 }],
      borderColor: visColors[i] + 'aa',
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderDash: [3, 3],
      pointRadius: [0, 5],
      pointBackgroundColor: visColors[i],
      pointBorderColor: 'transparent',
      showLine: true, fill: false,
      tension: 0, order: 5 + i,
    };
  }).filter(Boolean);

  if (cVis) cVis.destroy();
  cVis = new Chart(document.getElementById('cVis'), {
    type: 'line',
    data: {
      datasets: [
        {
          label: `Target ${fmt(targetConf*100, targetConf*100 >= 99 ? 1 : 0)}%`,
          data: visUnits.map(u => ({ x: u, y: targetConf * 100 })),
          borderColor: '#4e9e7e', borderWidth: 1.5, borderDash: [6, 4],
          pointRadius: 0, fill: false, order: 99,
        },
        ...curveDatasets.map(ds => ({ ...ds, data: ds.data.map((y, i) => ({ x: visUnits[i], y })) })),
        ...crossingDatasets,
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      parsing: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            boxWidth: 12, padding: 14, font: { size: 11 },
            filter: item => !item.text.startsWith('_'),
          }
        },
        tooltip: {
          callbacks: {
            title: items => `Unit ${items[0].parsed.x}`,
            label: c => {
              if (c.dataset.label.startsWith('_')) return null;
              return c.parsed.y !== null ? `${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` : null;
            },
          },
          filter: item => !item.dataset.label.startsWith('_'),
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Time units', font: { size: 11 } },
          ticks: { maxTicksLimit: 12, font: { size: 10 } },
          min: 1,
        },
        y: {
          title: { display: true, text: 'Confidence (%)', font: { size: 11 } },
          min: 0, max: 100,
          ticks: { font: { size: 10 } }
        }
      }
    }
  });

  if (cConf) cConf.destroy();
  cConf = new Chart(document.getElementById('cConf'), {
    type: 'line',
    data: {
      labels: units.map(u => u),
      datasets: [
        {
          label: `Confidence (${fmt(expectedUplift*100,1)}% uplift)`,
          data: units.map(u => confAtUnit(u, visPerUnit, p1, p2, tails)),
          borderColor: '#4f78d6',
          backgroundColor: 'rgba(79,120,214,0.08)',
          fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2,
        },
        {
          label: `Target ${fmt(targetConf*100, targetConf*100 >= 99 ? 1 : 0)}%`,
          data: units.map(() => targetConf * 100),
          borderColor: '#4e9e7e', borderWidth: 2, borderDash: [6, 4],
          pointRadius: 0, fill: false,
        },
        // vertical "now" line via a scatter point + annotation-free approach:
        // represented as a single-point dataset
        {
          label: `Now (unit ${since})`,
          data: units.map(u => u === since ? confAtSince : null),
          borderColor: 'rgba(199,154,79,0.8)',
          backgroundColor: '#c79a4f',
          pointRadius: units.map(u => u === since ? 6 : 0),
          pointHoverRadius: 8,
          showLine: false, fill: false,
          type: 'scatter',
        },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, padding: 14, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            title: items => `Unit ${items[0].label}`,
            label: c => c.raw !== null ? `${c.dataset.label}: ${typeof c.raw === 'number' ? c.raw.toFixed(2) + '%' : c.raw}` : null,
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Time units since test start', font: { size: 11 } },
          ticks: { maxTicksLimit: 12, font: { size: 10 } },
          min: 1,
        },
        y: {
          title: { display: true, text: 'Confidence (%)', font: { size: 11 } },
          min: 0, max: 100,
          ticks: { font: { size: 10 } }
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

['scUplift', 'scVis', 'scSince'].forEach(id => {
  document.getElementById(id).addEventListener('input', function(){
    this.dataset.manual = '1';
    chartsDirty = true;
    renderCharts();
    history.replaceState(null, '', '?' + buildStateParams().toString());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SHARE / RESTORE STATE
// ─────────────────────────────────────────────────────────────────────────────

function buildStateParams() {
  const p = new URLSearchParams();
  p.set('vis',   document.getElementById('sTotalVis').value);
  p.set('conf',  document.querySelector('input[name="sConf"]:checked')?.value || '0.95');
  p.set('pwr',   document.querySelector('input[name="sPower"]:checked')?.value || '0.80');
  p.set('type',  document.querySelector('input[name="sType"]:checked')?.value || '2');
  p.set('cd',    document.getElementById('ctrl-dist').value);
  p.set('cn',    document.getElementById('ctrl-n').value);
  p.set('cc',    document.getElementById('ctrl-c').value);
  p.set('since', document.getElementById('scSince').value);
  p.set('scvis', document.getElementById('scVis').value);
  p.set('scupl', document.getElementById('scUplift').value);
  p.set('nv',    variants.length);
  variants.forEach((vr, i) => {
    p.set(`vd${i}`, document.getElementById(vr.id + '-dist').value);
    p.set(`vn${i}`, document.getElementById(vr.id + '-n').value);
    p.set(`vc${i}`, document.getElementById(vr.id + '-c').value);
  });
  return p;
}

function shareState() {
  const url = location.origin + location.pathname + '?' + buildStateParams().toString();
  navigator.clipboard.writeText(url).then(() => {
    const t = document.getElementById('shareToast');
    t.classList.add('share-toast--visible');
    setTimeout(() => t.classList.remove('share-toast--visible'), 2200);
  });
}

function restoreFromParams() {
  const p = new URLSearchParams(location.search);
  if (!p.has('vis')) return false;

  document.getElementById('sTotalVis').value = p.get('vis');

  const conf = p.get('conf');
  if (conf) document.querySelector(`input[name="sConf"][value="${conf}"]`)?.click();
  const pwr = p.get('pwr');
  if (pwr) document.querySelector(`input[name="sPower"][value="${pwr}"]`)?.click();
  const type = p.get('type');
  if (type) document.querySelector(`input[name="sType"][value="${type}"]`)?.click();

  setKnobDisplay('ctrl', parseInt(p.get('cd')) || 50);
  document.getElementById('ctrl-n').value = p.get('cn') || 5000;
  document.getElementById('ctrl-c').value = p.get('cc') || 250;

  if (p.has('since')) { const el = document.getElementById('scSince'); el.value = p.get('since'); el.dataset.manual = '1'; }
  if (p.has('scvis')) { const el = document.getElementById('scVis');   el.value = p.get('scvis'); el.dataset.manual = '1'; }
  if (p.has('scupl')) { const el = document.getElementById('scUplift');el.value = p.get('scupl'); el.dataset.manual = '1'; }

  const nv = parseInt(p.get('nv')) || 0;
  for (let i = 0; i < nv; i++) {
    addVariant();
    const id = variants[variants.length - 1].id;
    const dist = parseInt(p.get(`vd${i}`)) || 50;
    setKnobDisplay(id, dist);
    document.getElementById(id + '-dist').value = dist;
    document.getElementById(id + '-n').value = p.get(`vn${i}`) || 5000;
    document.getElementById(id + '-c').value = p.get(`vc${i}`) || 0;
  }

  recalc();
  return true;
}

function copyChart(chartId) {
  const canvas = document.getElementById(chartId);
  if (!canvas) return;
  canvas.toBlob(blob => {
    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => {
      const btn = event.target.closest('.chart-copy-btn');
      if (btn) {
        const origContent = btn.innerHTML;
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
        setTimeout(() => btn.innerHTML = origContent, 1500);
      }
    }).catch(() => alert('Failed to copy chart'));
  });
}

// Boot: restore from URL or render defaults
if (!restoreFromParams()) {
  addVariant();
  document.getElementById('v0-c').value = 280;
  recalc();
}
