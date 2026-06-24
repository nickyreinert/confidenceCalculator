// ─── STATISTICS ──────────────────────────────────────────────────────────────

function normalCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return z > 0 ? 1 - p : p;
}

function invNorm(p) {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pL = 0.02425, pH = 1 - pL;
  let q;
  if (p < pL) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
  if (p <= pH) {
    q = p - 0.5; const r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
}

function sampleSizePerGroup(baseRate, relLift, alpha, power) {
  const p1 = baseRate, p2 = baseRate * (1 + relLift);
  if (p2 <= 0 || p2 >= 1 || p1 <= 0 || p1 >= 1) return Infinity;
  const za = invNorm(1 - alpha / 2), zb = invNorm(power);
  return Math.ceil((za + zb) ** 2 * (p1 * (1 - p1) + p2 * (1 - p2)) / (p2 - p1) ** 2);
}

// ─── STATE ───────────────────────────────────────────────────────────────────

const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a'];
let nextVarIdx = 1;

const state = {
  settings: { conf: 0.95, power: 0.80, tails: 2, dailyVis: 1000 },
  ctrl: { n: 10188, c: 169 },
  variants: [{ id: 'v0', label: 'Variant A', color: COLORS[0], n: 10240, c: 170 }]
};

// ─── ROW DEFINITIONS ─────────────────────────────────────────────────────────
// ctrlKey: key in ctrlResult to show in control column (null = dash)
// varKey:  key in varResult to show in variant column(s) (null = dash)
// input:   true = editable <input> fields
// result:  true = styled confidence pill
// fmt:     format string

const ROWS = [
  { type: 'section', label: 'Inputs' },
  { key: 'n',        label: 'Unique Visitors',        input: true,  tip: 'n' },
  { key: 'c',        label: 'Conversions',            input: true,  tip: 'c' },
  { ctrlKey: 'rate',  varKey: 'rate',     label: 'Conversion Rate',        fmt: 'pct4',       tip: 'rate' },

  { type: 'section', label: 'Calculations' },
  { ctrlKey: null,    varKey: 'uplift',   label: 'Uplift',                 fmt: 'pct2signed', tip: 'uplift' },
  { ctrlKey: 'sd',    varKey: 'sd',       label: 'Standard Deviation',     fmt: 'dec6',       tip: 'sd' },
  { ctrlKey: 'se',    varKey: 'se',       label: 'Standard Error',         fmt: 'dec6',       tip: 'se' },
  { ctrlKey: null,    varKey: 'seDiff',   label: 'SE of Difference',       fmt: 'dec6',       tip: 'seDiff' },
  { ctrlKey: null,    varKey: 'z',        label: 'Z-Score',                fmt: 'dec6',       tip: 'z' },
  { ctrlKey: 'zCrit', varKey: null,       label: 'Z-Critical',             fmt: 'dec6',       tip: 'zCrit' },

  { type: 'section', label: 'Power Analysis' },
  { ctrlKey: null,    varKey: 'powZ',     label: 'Power',                  fmt: 'dec6',       tip: 'powZ' },
  { ctrlKey: null,    varKey: 'powNeg',   label: 'Power (negative uplift)', fmt: 'pct2',      tip: 'powNeg' },
  { ctrlKey: null,    varKey: 'powPos',   label: 'Power (positive uplift)', fmt: 'pct2',      tip: 'powPos' },

  { type: 'section', label: 'Significance' },
  { ctrlKey: null,    varKey: 'normDist', label: 'Normal Distribution',    fmt: 'dec6',       tip: 'normDist' },
  { ctrlKey: null,    varKey: 'pFixed',   label: 'p-value (one-tailed)',   fmt: 'dec6',       tip: 'pFixed' },
  { ctrlKey: null,    varKey: 'p',        label: 'p-value',                fmt: 'dec6',       tip: 'p' },

  { type: 'section', label: 'Result' },
  { ctrlKey: null,    varKey: 'conf',     label: 'Confidence',             result: true,      tip: 'conf' },
];

// ─── TOOLTIP CONTENT ─────────────────────────────────────────────────────────

const TIPS = {
  n: {
    title: 'Unique Visitors',
    formula: null,
    body: 'Total unique users exposed to this version during the test. More visitors → smaller standard error → more reliable rate estimate. Never count the same user twice.'
  },
  c: {
    title: 'Conversions',
    formula: null,
    body: 'How many visitors completed the goal action (purchase, signup, click…). Each visitor either converts (1) or doesn\'t (0) — this is a Bernoulli trial.'
  },
  rate: {
    title: 'Conversion Rate',
    formula: 'p = Conversions ÷ Visitors',
    body: 'The core metric. We compare rates between groups. Small differences in rate can still be meaningful — the question is whether they\'re bigger than random noise.'
  },
  uplift: {
    title: 'Uplift (Relative Lift)',
    formula: 'uplift = (p₂ − p₁) / p₁',
    body: '<strong>Relative</strong> improvement over control. +10% uplift means the variant converts 10% more than control\'s rate — <em>not</em> 10 percentage points more. A small absolute difference can be a large relative uplift at low base rates.'
  },
  sd: {
    title: 'Standard Deviation',
    formula: 'σ = √(p × (1 − p))',
    body: 'Spread of individual outcomes (0 or 1). For a yes/no event, this is maximised at p = 50%. Near 0% or 100%, outcomes are predictable and SD is small.'
  },
  se: {
    title: 'Standard Error',
    formula: 'SE = σ / √n',
    body: 'How much the measured rate would vary if you repeated the test. Shrinks proportionally to √n — doubling your sample halves the SE. This is the "ruler" for measuring significance.'
  },
  seDiff: {
    title: 'Standard Error of the Difference',
    formula: 'SE_diff = √(SE₁² + SE₂²)',
    body: 'Combines uncertainty from both groups. This is the denominator in the z-score formula — the "noise floor" against which we measure the observed difference (the "signal").'
  },
  z: {
    title: 'Z-Score',
    formula: 'z = (p₂ − p₁) / SE_diff',
    body: 'Signal-to-noise ratio. How many standard errors is the observed difference from zero? The further from zero, the less likely the result is pure luck. |z| > 1.96 → 95% confidence (two-tailed).'
  },
  zCrit: {
    title: 'Z-Critical Value',
    formula: 'z_crit = Φ⁻¹(1 − α/2)',
    body: 'The z-score threshold your result must exceed to be significant. Set by your chosen confidence level and test type.\n\n90% two-tailed → 1.645 | 95% → 1.960 | 99% → 2.576'
  },
  powZ: {
    title: 'Power (intermediate z-value)',
    formula: 'z_pow = z_crit − |z|',
    body: 'Intermediate step: the distance between z_critical and the observed |z|. Used to compute the power percentages below. Negative = test is already "powered" at the observed effect.'
  },
  powNeg: {
    title: 'Power (negative uplift)',
    formula: 'Φ(−z_crit − |z|)',
    body: 'Probability of detecting a statistically significant result if the true effect is <em>negative</em>. Typically very small — the test is not very sensitive to harm at low effect sizes.'
  },
  powPos: {
    title: 'Power (positive uplift)',
    formula: 'Φ(|z| − z_crit)',
    body: 'If the true effect equals what you\'ve observed, what\'s the probability of correctly detecting it? Standard target: 80%. At 5%, you\'d need roughly 16× more data to reliably catch this effect.'
  },
  normDist: {
    title: 'Normal Distribution (CDF at z)',
    formula: 'Φ(z)',
    body: 'The cumulative probability at the observed z-score. P(Z ≤ z) under a standard normal distribution. Used to derive the p-value. At z = 0 this equals exactly 0.5.'
  },
  pFixed: {
    title: 'p-value (one-tailed)',
    formula: '1 − Φ(z)',
    body: 'Probability of seeing a result this good or better purely by chance, if there\'s truly no effect. One-tailed = only tests for improvement. More lenient than two-tailed.'
  },
  p: {
    title: 'p-value (two-tailed)',
    formula: '2 × (1 − Φ(|z|))',
    body: 'Probability of seeing a result this extreme in <em>either</em> direction by pure chance. The standard for most A/B tests. Lower = more significant. The confidence level = 1 − p.'
  },
  conf: {
    title: 'Confidence Level',
    formula: 'confidence = 1 − p-value',
    body: '<strong>In plain English: the probability that the result is NOT just coincidence.</strong>\n\n95% confidence means: if the variant truly had zero effect, you\'d only see a result this extreme by random luck 5 times out of 100. The higher this number, the more you can trust the result.'
  }
};

// ─── FORMAT HELPERS ──────────────────────────────────────────────────────────

function fmtVal(val, f) {
  if (!isFinite(val) || isNaN(val)) return null;
  switch (f) {
    case 'pct4':       return (val * 100).toFixed(4) + '%';
    case 'pct2':       return (val * 100).toFixed(2) + '%';
    case 'pct2signed': return (val >= 0 ? '+' : '') + (val * 100).toFixed(2) + '%';
    case 'dec4':       return val.toFixed(4);
    case 'dec6':       return val.toFixed(6);
    default:           return String(val);
  }
}

function confPillHTML(conf, adjConf, uplift) {
  const isWin   = conf >= adjConf && uplift >  0.00005;
  const isLoss  = conf >= adjConf && uplift < -0.00005;
  const isClose = !isWin && !isLoss && conf >= adjConf * 0.85;
  const c  = isWin ? '#059669' : isLoss ? '#dc2626' : isClose ? '#d97706' : '#94a3b8';
  const bg = isWin ? '#ecfdf5' : isLoss ? '#fff5f5' : isClose ? '#fffbeb' : '#f1f5f9';
  const badge = isWin ? 'WIN' : isLoss ? 'LOSS' : isClose ? 'CLOSE' : '–';
  return `<span class="conf-pill" style="color:${c};background:${bg}">
    <span class="conf-pct">${(conf * 100).toFixed(2)}%</span>
    <span class="conf-badge">${badge}</span>
  </span>`;
}

// ─── COMPUTATION ─────────────────────────────────────────────────────────────

function computeCtrl() {
  const { n, c } = state.ctrl;
  const rate = n > 0 ? c / n : 0;
  const sd   = Math.sqrt(rate * (1 - rate));
  const se   = n > 0 ? sd / Math.sqrt(n) : 0;
  const alpha = 1 - state.settings.conf;
  const zCrit = invNorm(1 - alpha / 2);
  return { rate, sd, se, zCrit };
}

function computeVariant(vr, ctrl) {
  const { n, c } = vr;
  const rate  = n > 0 ? c / n : 0;
  const sd    = Math.sqrt(rate * (1 - rate));
  const se    = n > 0 ? sd / Math.sqrt(n) : 0;
  const seDiff = Math.sqrt(ctrl.se ** 2 + se ** 2);
  const z      = seDiff > 0 ? (rate - ctrl.rate) / seDiff : 0;
  const uplift = ctrl.rate > 0 ? (rate - ctrl.rate) / ctrl.rate : 0;
  const tails  = state.settings.tails;
  const powZ   = ctrl.zCrit - Math.abs(z);
  const powPos = normalCDF(Math.abs(z) - ctrl.zCrit);
  const powNeg = normalCDF(-ctrl.zCrit - Math.abs(z));
  const normDist = normalCDF(z);
  const pFixed   = 1 - normDist;
  const p = tails === 2 ? 2 * (1 - normalCDF(Math.abs(z))) : pFixed;
  const conf = 1 - p;
  return { rate, sd, se, seDiff, z, uplift, powZ, powPos, powNeg, normDist, pFixed, p, conf };
}

// ─── TABLE BUILD ─────────────────────────────────────────────────────────────

function buildTable() {
  const nVar = state.variants.length;
  const colSpan = 2 + nVar + 1;
  let h = '';

  // thead
  h += '<thead><tr>';
  h += '<th class="c-label"></th>';
  h += '<th class="c-data"><div class="var-header"><div class="var-dot" style="background:#475569"></div>Control</div></th>';
  state.variants.forEach(v => {
    h += `<th class="c-data"><div class="var-header">
      <div class="var-dot" style="background:${v.color}"></div>
      <span>${v.label}</span>
      <button class="rm-btn" onclick="removeVariant('${v.id}')">✕</button>
    </div></th>`;
  });
  h += '<th class="c-add"><button class="btn-add-var" onclick="addVariant()">+ Variant</button></th>';
  h += '</tr></thead><tbody>';

  ROWS.forEach(row => {
    if (row.type === 'section') {
      h += `<tr class="r-section"><td class="c-label" colspan="${colSpan}">${row.label}</td></tr>`;
      return;
    }
    const cls = row.input ? 'r-input' : row.result ? 'r-result' : 'r-calc';
    h += `<tr class="${cls}">`;
    h += `<td class="c-label">${row.label} <button class="info-btn" onclick="showInfo('${row.tip}')">ℹ</button></td>`;

    if (row.input) {
      h += `<td class="c-data input-cell"><input type="number" id="ctrl-${row.key}" value="${state.ctrl[row.key]}" min="0" oninput="onInput('ctrl','${row.key}',this.value)"></td>`;
      state.variants.forEach(v => {
        h += `<td class="c-data input-cell"><input type="number" id="${v.id}-${row.key}" value="${v[row.key]}" min="0" oninput="onInput('${v.id}','${row.key}',this.value)"></td>`;
      });
    } else {
      // ctrl cell
      h += row.ctrlKey
        ? `<td class="c-data" id="ctrl-${row.ctrlKey}">—</td>`
        : `<td class="c-data dash">—</td>`;
      // variant cells
      state.variants.forEach(v => {
        if (!row.varKey) {
          h += `<td class="c-data dash">—</td>`;
        } else {
          h += `<td class="c-data" id="${v.id}-${row.varKey}">—</td>`;
        }
      });
    }

    h += '<td class="c-add"></td></tr>';
  });

  h += '</tbody>';
  document.getElementById('calcTable').innerHTML = h;
  updateValues();
}

// ─── VALUE UPDATE (no DOM rebuild, preserves focus) ──────────────────────────

function updateValues() {
  const ctrl = computeCtrl();
  const nVar = state.variants.length;
  const adjConf = 1 - (1 - state.settings.conf) / nVar;

  // ctrl cells
  set('ctrl-rate',  ctrl.rate,  'pct4');
  set('ctrl-sd',    ctrl.sd,    'dec6');
  set('ctrl-se',    ctrl.se,    'dec6');
  set('ctrl-zCrit', ctrl.zCrit, 'dec6');

  // Bonferroni notice
  const bf = document.getElementById('bfNotice');
  if (bf) {
    bf.style.display = nVar > 1 ? 'flex' : 'none';
    if (nVar > 1) {
      const adjA = (1 - state.settings.conf) / nVar;
      document.getElementById('bfAlpha').textContent = (adjA * 100).toFixed(2) + '%';
      document.getElementById('bfCount').textContent = nVar;
    }
  }

  state.variants.forEach(v => {
    const r = computeVariant(v, ctrl);
    set(`${v.id}-rate`,     r.rate,     'pct4');
    set(`${v.id}-uplift`,   r.uplift,   'pct2signed', r.uplift > 0.00005 ? 'pos' : r.uplift < -0.00005 ? 'neg' : '');
    set(`${v.id}-sd`,       r.sd,       'dec6');
    set(`${v.id}-se`,       r.se,       'dec6');
    set(`${v.id}-seDiff`,   r.seDiff,   'dec6');
    set(`${v.id}-z`,        r.z,        'dec6');
    set(`${v.id}-powZ`,     r.powZ,     'dec6');
    set(`${v.id}-powNeg`,   r.powNeg,   'pct2');
    set(`${v.id}-powPos`,   r.powPos,   'pct2');
    set(`${v.id}-normDist`, r.normDist, 'dec6');
    set(`${v.id}-pFixed`,   r.pFixed,   'dec6');
    set(`${v.id}-p`,        r.p,        'dec6');
    const confEl = document.getElementById(`${v.id}-conf`);
    if (confEl) confEl.innerHTML = confPillHTML(r.conf, adjConf, r.uplift);
  });

  autoFillScenarios();
  renderCharts();
}

function set(id, val, fmt, extraClass) {
  const el = document.getElementById(id);
  if (!el) return;
  const str = fmtVal(val, fmt);
  if (str === null) {
    el.innerHTML = '<span class="dash">—</span>';
    el.className = el.className.replace(/\bpos\b|\bneg\b/g, '').trim();
  } else {
    el.textContent = str;
    el.className = el.className.replace(/\bpos\b|\bneg\b/g, '').trim();
    if (extraClass) el.classList.add(extraClass);
  }
}

// ─── INPUT HANDLING ──────────────────────────────────────────────────────────

function onInput(group, key, val) {
  const n = parseFloat(val) || 0;
  if (group === 'ctrl') {
    state.ctrl[key] = n;
  } else {
    const v = state.variants.find(v => v.id === group);
    if (v) v[key] = n;
  }
  updateValues();
}

// ─── VARIANTS ────────────────────────────────────────────────────────────────

function addVariant() {
  if (state.variants.length >= 5) { alert('Maximum 5 variants supported.'); return; }
  const letter = String.fromCharCode(65 + nextVarIdx);
  state.variants.push({
    id: 'v' + nextVarIdx,
    label: 'Variant ' + letter,
    color: COLORS[state.variants.length],
    n: 10000,
    c: 170
  });
  nextVarIdx++;
  buildTable();
}

function removeVariant(id) {
  if (state.variants.length <= 1) return;
  state.variants = state.variants.filter(v => v.id !== id);
  buildTable();
}

// ─── SETTINGS MODAL ──────────────────────────────────────────────────────────

function openSettings() {
  document.getElementById('sConf').value  = state.settings.conf;
  document.getElementById('sPower').value = state.settings.power;
  document.getElementById('sTails').value = state.settings.tails;
  document.getElementById('sVis').value   = state.settings.dailyVis;
  document.getElementById('settingsOverlay').classList.remove('hidden');
}

function saveSettings() {
  state.settings.conf     = parseFloat(document.getElementById('sConf').value);
  state.settings.power    = parseFloat(document.getElementById('sPower').value);
  state.settings.tails    = parseInt(document.getElementById('sTails').value);
  state.settings.dailyVis = parseFloat(document.getElementById('sVis').value) || 1000;
  document.getElementById('settingsOverlay').classList.add('hidden');
  updateValues();
}

function closeSettings() {
  document.getElementById('settingsOverlay').classList.add('hidden');
}

// ─── INFO MODAL ──────────────────────────────────────────────────────────────

function showInfo(key) {
  const tip = TIPS[key];
  if (!tip) return;
  document.getElementById('tipTitle').textContent = tip.title;
  const fEl = document.getElementById('tipFormula');
  if (tip.formula) { fEl.textContent = tip.formula; fEl.style.display = 'block'; }
  else { fEl.style.display = 'none'; }
  document.getElementById('tipBody').innerHTML = tip.body.replace(/\n/g, '<br>');
  document.getElementById('infoOverlay').classList.remove('hidden');
}

function closeInfo() {
  document.getElementById('infoOverlay').classList.add('hidden');
}

// Close modals on overlay click
document.getElementById('settingsOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeSettings(); });
document.getElementById('infoOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeInfo(); });

// ─── SCENARIOS ───────────────────────────────────────────────────────────────

let scenOpen = true;
function toggleScenarios() {
  scenOpen = !scenOpen;
  document.getElementById('scenBody').style.display = scenOpen ? 'block' : 'none';
  document.querySelector('.scen-toggle span:last-child').textContent = scenOpen ? '▾' : '▸';
}

function autoFillScenarios() {
  const ctrl = computeCtrl();
  const baseEl = document.getElementById('scBase');
  if (!baseEl.dataset.manual) baseEl.value = (ctrl.rate * 100).toFixed(4);
  const visEl = document.getElementById('scVis');
  visEl.value = state.settings.dailyVis;
  if (state.variants.length > 0) {
    const r = computeVariant(state.variants[0], ctrl);
    const ulEl = document.getElementById('scUplift');
    if (!ulEl.dataset.manual) ulEl.value = (r.uplift * 100).toFixed(2);
  }
}

['scBase', 'scUplift'].forEach(id => {
  document.getElementById(id).addEventListener('input', function () {
    this.dataset.manual = '1';
    renderCharts();
  });
});
document.getElementById('scVis').addEventListener('input', renderCharts);

// ─── CHARTS ──────────────────────────────────────────────────────────────────

let chartDays = null, chartConf = null;

function renderCharts() {
  const baseRate    = (parseFloat(document.getElementById('scBase').value) || 0) / 100;
  const dailyVis    = parseFloat(document.getElementById('scVis').value) || 1000;
  const upliftPct   = parseFloat(document.getElementById('scUplift').value) || 0;
  const uplift      = upliftPct / 100;
  const targetConf  = state.settings.conf;
  const power       = state.settings.power;

  // Chart 1: Days needed vs uplift %, three confidence curves
  const lifts = Array.from({ length: 50 }, (_, i) => i + 1);
  const confLevels = [
    { conf: 0.90, label: '90%', color: '#f59e0b' },
    { conf: 0.95, label: '95%', color: '#2563eb' },
    { conf: 0.99, label: '99%', color: '#dc2626' },
  ];

  if (chartDays) chartDays.destroy();
  chartDays = new Chart(document.getElementById('cDays'), {
    type: 'line',
    data: {
      labels: lifts.map(l => l + '%'),
      datasets: confLevels.map(cl => ({
        label: cl.label + ' confidence',
        data: lifts.map(l => {
          if (baseRate <= 0) return null;
          const n = sampleSizePerGroup(baseRate, l / 100, 1 - cl.conf, power);
          const days = Math.ceil(n / dailyVis);
          return days <= 365 ? days : null;
        }),
        borderColor: cl.color, backgroundColor: cl.color + '15',
        tension: 0.35, pointRadius: 0, borderWidth: 2, fill: false,
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 10, padding: 12, font: { size: 10 } } },
        tooltip: { callbacks: { label: c => c.raw != null ? `${c.dataset.label}: ${c.raw} days` : '> 365 days' } }
      },
      scales: {
        x: { title: { display: true, text: 'Expected Relative Uplift', font: { size: 10 } }, ticks: { font: { size: 9 } } },
        y: { title: { display: true, text: 'Days Needed', font: { size: 10 } }, min: 0, ticks: { font: { size: 9 } } }
      }
    }
  });

  // Chart 2: Confidence over time at expected uplift
  const days = Array.from({ length: 90 }, (_, i) => i + 1);
  const p1 = baseRate, p2 = baseRate * (1 + uplift);

  const confData = days.map(d => {
    if (baseRate <= 0 || uplift === 0 || p2 >= 1) return 0;
    const n = d * dailyVis;
    const sd1 = Math.sqrt(p1 * (1 - p1)), sd2 = Math.sqrt(p2 * (1 - p2));
    const seDiff = Math.sqrt(sd1 ** 2 / n + sd2 ** 2 / n);
    const z = seDiff > 0 ? (p2 - p1) / seDiff : 0;
    const pv = 2 * (1 - normalCDF(Math.abs(z)));
    return Math.max(0, Math.min(100, (1 - pv) * 100));
  });

  if (chartConf) chartConf.destroy();
  chartConf = new Chart(document.getElementById('cConf'), {
    type: 'line',
    data: {
      labels: days.map(d => 'Day ' + d),
      datasets: [
        {
          label: `Confidence at ${upliftPct.toFixed(1)}% uplift`,
          data: confData,
          borderColor: '#2563eb', backgroundColor: '#2563eb15', fill: true,
          tension: 0.4, pointRadius: 0, borderWidth: 2,
        },
        {
          label: `Target (${(targetConf * 100).toFixed(0)}%)`,
          data: days.map(() => targetConf * 100),
          borderColor: '#10b981', borderDash: [5, 3],
          pointRadius: 0, fill: false, borderWidth: 1.5,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 10, padding: 12, font: { size: 10 } } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${typeof c.raw === 'number' ? c.raw.toFixed(1) + '%' : c.raw}` } }
      },
      scales: {
        x: { title: { display: true, text: 'Test Day', font: { size: 10 } }, ticks: { maxTicksLimit: 10, font: { size: 9 } } },
        y: { title: { display: true, text: 'Confidence (%)', font: { size: 10 } }, min: 0, max: 100, ticks: { font: { size: 9 } } }
      }
    }
  });
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

buildTable();
