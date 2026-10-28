// ─────────────────────────────────────────────────────────────────────────────
// DEEP DIVE — daily history, checks and breakdowns
// Loaded before app.js; only uses app.js helpers at call time.
// ─────────────────────────────────────────────────────────────────────────────

// { dates: ['YYYY-MM-DD', …] (contiguous), groups: [{ label, n: [], c: [] }] } — groups[0] is control
let deepData = null;
let deepEncoded = '';      // compressed copy for share links (filled asynchronously)
let deepPending = '';      // compressed data from the URL that is still being decoded
let deepEncodeSeq = 0;
let cDeepTraffic = null, cDeepConf = null, cDeepUplift = null;

const URL_WARN_CHARS = 8000;
const CTRL_COLOR = '#6f7689';

const deepEnabled = () => !!document.getElementById('deepToggle')?.checked;
const deepWindowRaw = () => document.querySelector('input[name="sWindow"]:checked')?.value || '14';
const deepWindow  = () => (deepWindowRaw() === 'all' ? Infinity : parseInt(deepWindowRaw()));
const sum = arr => arr.reduce((s, x) => s + x, 0);
const groupColor = gi => gi === 0 ? CTRL_COLOR : COLORS[(gi - 1) % COLORS.length];
const pctShort = x => `${Math.round(x * 1000) / 10}%`;
const signPct = x => `${x > 0 ? '+' : ''}${fmt(x * 100, 1)}%`;

function fmtShortDate(iso, withYear = true) {
  const d = parseLocalDate(iso);
  return d ? d.toLocaleDateString(undefined, withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }) : iso;
}

// Compact axis labels: "15 Sep" or "15 Sep 25" when the data spans several years
function deepLabels(dates) {
  const multiYear = dates[0].slice(0, 4) !== dates[dates.length - 1].slice(0, 4);
  return dates.map(iso => parseLocalDate(iso).toLocaleDateString(undefined,
    multiYear ? { day: 'numeric', month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' }));
}

function deepSettings() {
  const targetConf = parseFloat(document.querySelector('input[name="sConf"]:checked')?.value || '0.95');
  const tails = parseInt(document.querySelector('input[name="sType"]:checked')?.value || '2');
  const nVar = deepData ? deepData.groups.length - 1 : 1;
  return { targetConf, tails, adjConf: 1 - (1 - targetConf) / Math.max(1, nVar) };
}

// Chi-square upper tail: exact for 1 degree of freedom, Wilson–Hilferty approximation above
function chiSquareP(x, df) {
  if (!(x > 0)) return 1;
  if (df === 1) return 2 * (1 - normalCDF(Math.sqrt(x)));
  const h = 2 / (9 * df);
  return 1 - normalCDF((Math.cbrt(x / df) - (1 - h)) / Math.sqrt(h));
}

// ── Data in / out ───────────────────────────────────────────────────────────

function setDeepData(data, encoded) {
  deepData = data && data.groups?.length >= 2 && data.dates?.length ? data : null;
  deepEncoded = deepData && encoded ? encoded : '';
  deepPending = '';
  if (deepData && !encoded) {
    const seq = ++deepEncodeSeq;
    encodeDeepData(deepData).then(s => {
      if (seq !== deepEncodeSeq) return;
      if (typeof preserveExampleData === 'function' && preserveExampleData(null, s)) return;
      deepEncoded = s;
      if (!_restoring) history.replaceState(null, '', '?' + buildStateParams().toString());
      renderDeepInfo();
    }).catch(() => {});
  }
}

const toBase64Url = bytes => {
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = str => {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64 + '='.repeat((4 - b64.length % 4) % 4)), ch => ch.charCodeAt(0));
};

async function encodeDeepData(data) {
  if (typeof CompressionStream === 'undefined') return '';
  // Day-to-day deltas compress far better than raw counts
  const delta = arr => arr.map((x, i) => (i ? x - arr[i - 1] : x));
  const payload = JSON.stringify({
    v: 1, s: data.dates[0], l: data.groups.map(g => g.label),
    n: data.groups.map(g => delta(g.n)), c: data.groups.map(g => delta(g.c)),
  });
  const stream = new Blob([payload]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

async function decodeDeepData(str) {
  const stream = new Blob([fromBase64Url(str)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const obj = JSON.parse(await new Response(stream).text());
  const undelta = arr => { let s = 0; return arr.map(x => (s += x)); };
  const start = parseLocalDate(obj.s);
  const len = obj.n?.[0]?.length || 0;
  if (obj.v !== 1 || !start || !len || !Array.isArray(obj.l)) throw new Error('Unsupported daily data');
  const dates = Array.from({ length: len }, (_, i) =>
    localDateStr(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
  return { dates, groups: obj.l.map((label, gi) => ({ label: String(label), n: undelta(obj.n[gi]), c: undelta(obj.c[gi]) })) };
}

// ── Traffic basis for projections ───────────────────────────────────────────

// Average visitors per day and group over the chosen recent window (today left out while running)
function deepRecentRates() {
  if (!deepEnabled() || !deepData) return null;
  const { dates, groups } = deepData;
  let end = dates.length;
  const excludedToday = end > 1 && dates[end - 1] === localDateStr(new Date());
  if (excludedToday) end--;
  const days = Math.min(deepWindow(), end);
  const from = end - days;
  return {
    rates: groups.map(g => sum(g.n.slice(from, end)) / days),
    days, all: from === 0, from: dates[from], to: dates[end - 1], excludedToday,
  };
}

// ── Toggle + render ─────────────────────────────────────────────────────────

function toggleDeepDive(show, skipHistory) {
  ['deepSidebar', 'deepSidebarLabel', 'deepSection'].forEach(id =>
    document.getElementById(id)?.classList.toggle('proj-hidden', !show));
  if (!show) document.getElementById('deepBreakdowns')?.classList.add('proj-hidden');
  chartsDirty = true;
  renderCharts();
  renderDeepDive();
  if (!skipHistory && !_restoring) history.replaceState(null, '', '?' + buildStateParams().toString());
}

function renderDeepDive() {
  if (deepEnabled()) {
    const has = !!deepData;
    document.getElementById('deepEmpty').style.display = has ? 'none' : '';
    document.getElementById('deepBody').style.display = has ? '' : 'none';
    document.getElementById('deepClearBtn').style.display = has ? '' : 'none';
    document.getElementById('deepBreakdowns').classList.toggle('proj-hidden', !has);
    renderDeepInfo();
    if (has) {
      renderDeepChecks();
      renderDeepCharts();
      renderBreakdown();
    }
  }
  updateJumpNav();
}

function renderDeepInfo() {
  const el = document.getElementById('deepInfo');
  if (!el) return;
  if (!deepData) { el.textContent = 'No daily data yet.'; return; }
  const { dates, groups } = deepData;
  let txt = `${fmtShortDate(dates[0])} – ${fmtShortDate(dates[dates.length - 1])} · ${dates.length} days · ${groups.length} groups · daily visitors are added up, so a repeat visitor counts once per day`;
  let warn = false;
  if (deepEncoded) {
    const len = (location.origin + location.pathname + '?' + buildStateParams().toString()).length;
    warn = len > URL_WARN_CHARS;
    txt += ` · share link ≈ ${fmt(len / 1024, 1)} KB`;
    if (warn) txt += ' — long: some apps cut links this size';
  }
  el.textContent = txt;
  el.classList.toggle('neg', warn);
}

// ── Checks ──────────────────────────────────────────────────────────────────

function renderDeepChecks() {
  const { dates, groups } = deepData;
  const days = dates.length;
  const items = [];
  const add = (level, html) => items.push({ level, html });

  // 1. Split stability: does every week (or day) get roughly the same split as the totals?
  const totals = groups.map(g => sum(g.n));
  const T = sum(totals);
  const blockLen = days >= 14 ? 7 : 1;
  const blocks = [];
  for (let b = 0; b < days; b += blockLen) {
    const e = Math.min(days, b + blockLen);
    // A short leftover week would look jumpy just because it's small
    if (blockLen === 7 && e - b < 3) continue;
    const n = groups.map(g => sum(g.n.slice(b, e)));
    if (sum(n) > 0) blocks.push(n);
  }
  if (T > 0 && blocks.length >= 2) {
    let chi = 0;
    blocks.forEach(n => {
      const rowT = sum(n);
      n.forEach((o, gi) => { const e = rowT * totals[gi] / T; if (e > 0) chi += (o - e) ** 2 / e; });
    });
    const p = chiSquareP(chi, (blocks.length - 1) * (groups.length - 1));
    const shares = blocks.map(n => n[0] / sum(n));
    const lo = Math.min(...shares), hi = Math.max(...shares);
    const per = blockLen === 7 ? 'week' : 'day';
    const range = `${escapeHtml(groups[0].label)} got between ${pctShort(lo)} and ${pctShort(hi)} of visitors per ${per} (overall ${pctShort(totals[0] / T)})`;
    const help = `<button class="help-btn" data-tooltip="${CONCEPTS.splitStability.tooltip}" onclick="openConcept('splitStability')">?</button>`;
    // Needs to be both unlikely by chance and big enough to matter
    if (p < 0.001 && hi - lo >= 0.02) {
      add('warn', `<strong>The split changed during the test.</strong> ${range}. If conversion rates also moved over time, the totals can mislead — check the traffic chart and, if needed, only use the period with a steady split. ${help}`);
    } else {
      add('ok', `<strong>Split stayed steady.</strong> ${range}. ${help}`);
    }
  }

  // 2. Fading or growing effect: first half vs second half
  if (days >= 14) {
    const h = Math.floor(days / 2);
    const part = (g, a, b) => [sum(g.n.slice(a, b)), sum(g.c.slice(a, b))];
    const [n1a, c1a] = part(groups[0], 0, h), [n1b, c1b] = part(groups[0], h, days);
    groups.slice(1).forEach(g => {
      const [n2a, c2a] = part(g, 0, h), [n2b, c2b] = part(g, h, days);
      if (!(n1a && n1b && n2a && n2b && c1a && c1b)) return;
      const p1a = c1a / n1a, p2a = c2a / n2a, p1b = c1b / n1b, p2b = c2b / n2b;
      const count = isCountMetric(p1a, p2a, p1b, p2b);
      const se = Math.sqrt(rateVariance(p1a, count) / n1a + rateVariance(p2a, count) / n2a +
                           rateVariance(p1b, count) / n1b + rateVariance(p2b, count) / n2b);
      const ua = p2a / p1a - 1, ub = p2b / p1b - 1;
      const z = se > 0 ? ((p2b - p1b) - (p2a - p1a)) / se : 0;
      const halves = `${signPct(ua)} in the first half → ${signPct(ub)} in the second half`;
      if (Math.abs(z) < 1.96) {
        add('ok', `<strong>${escapeHtml(g.label)}: no clear change in uplift.</strong> ${halves} — within normal ups and downs.`);
      } else if (Math.abs(ub) < Math.abs(ua) || Math.sign(ub) !== Math.sign(ua)) {
        add('warn', `<strong>${escapeHtml(g.label)}: uplift is fading.</strong> ${halves}. Typical for a novelty effect — people react to "new" at first, then get used to it. The overall result likely overstates the long-term effect.`);
      } else {
        add('warn', `<strong>${escapeHtml(g.label)}: uplift is growing.</strong> ${halves}. People may need time to get used to the change. The overall result may understate the long-term effect.`);
      }
    });
  } else {
    add('info', `<strong>Fading check needs 14 days.</strong> You have ${days} — come back later to see if the effect holds up.`);
  }

  // 3. Full weeks
  const weeks = Math.floor(days / 7), rest = days % 7;
  if (days < 7) {
    add('warn', `<strong>Less than one full week.</strong> Weekdays and weekends often behave differently — run at least one full week, ideally two.`);
  } else if (rest) {
    add('info', `<strong>${weeks} ${weeks === 1 ? 'week' : 'weeks'} and ${rest} ${rest === 1 ? 'day' : 'days'}.</strong> Some weekdays count more than others. Full weeks give the fairest result.`);
  } else {
    add('ok', `<strong>${weeks} full ${weeks === 1 ? 'week' : 'weeks'}.</strong> Every weekday counts equally.`);
  }

  // 4. Traffic concentration
  const daily = dates.map((_, i) => sum(groups.map(g => g.n[i])));
  if (days >= 10 && T > 0) {
    const k = Math.max(1, Math.ceil(days * 0.1));
    const lastShare = sum(daily.slice(-k)) / T;
    const topShare = sum([...daily].sort((a, b) => b - a).slice(0, k)) / T;
    if (lastShare > 0.5) {
      add('warn', `<strong>${pctShort(lastShare)} of visitors came in the last ${k} of ${days} days.</strong> The result mostly reflects that period, not the whole test.`);
    } else if (topShare > 0.5) {
      add('warn', `<strong>${pctShort(topShare)} of visitors came on just ${k} of ${days} days.</strong> The result mostly reflects those days — check what happened then (campaign, sale, outage).`);
    }
  }

  // 5. Gaps and the running day
  const empty = daily.filter(t => t === 0).length;
  if (empty) add('info', `<strong>${empty} ${empty === 1 ? 'day' : 'days'} without visitors.</strong> Tracking outage or test paused? Those days count as zero in the traffic basis.`);
  if (dates[days - 1] === localDateStr(new Date())) {
    add('info', `<strong>Today is still running.</strong> It's left out of the traffic basis for projections.`);
  }

  const icon = { warn: '⚠', info: 'ℹ', ok: '✓' };
  document.getElementById('deepChecks').innerHTML = items
    .map(it => `<div class="alert alert-${it.level}"><span class="alert-icon">${icon[it.level]}</span><span>${it.html}</span></div>`)
    .join('');
}

// ── Charts ──────────────────────────────────────────────────────────────────

function renderDeepCharts() {
  const { dates, groups } = deepData;
  const { tails, targetConf, adjConf } = deepSettings();
  const labels = deepLabels(dates);
  const cum = groups.map(g => {
    let sn = 0, sc = 0;
    return { n: g.n.map(x => (sn += x)), c: g.c.map(x => (sc += x)) };
  });
  const xTicks = { maxTicksLimit: 10, autoSkip: true, autoSkipPadding: 16, maxRotation: 0, font: { size: 10 } };
  const legend = { position: 'top', labels: { boxWidth: 12, padding: 14, font: { size: 11 }, filter: item => !item.text.startsWith('_') } };

  // Traffic per day
  if (cDeepTraffic) cDeepTraffic.destroy();
  cDeepTraffic = new Chart(document.getElementById('cDeepTraffic'), {
    type: 'bar',
    data: {
      labels,
      datasets: groups.map((g, gi) => ({
        label: g.label, data: g.n, stack: 'visitors',
        backgroundColor: groupColor(gi) + 'b3', borderWidth: 0,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend, tooltip: { mode: 'index', intersect: false, callbacks: { label: c => `${c.dataset.label}: ${c.raw.toLocaleString()}` } } },
      scales: {
        x: { stacked: true, ticks: xTicks, grid: { display: false } },
        y: { stacked: true, title: { display: true, text: 'Visitors per day', font: { size: 11 } }, ticks: { font: { size: 10 }, callback: v => v.toLocaleString() } },
      },
    },
  });

  // Actual confidence over time (cumulative)
  const confData = gi => dates.map((_, i) => {
    const n1 = cum[0].n[i], n2 = cum[gi].n[i];
    if (n1 < 1 || n2 < 1) return null;
    const { z } = zTest(n1, cum[0].c[i], n2, cum[gi].c[i]);
    return (1 - pFromZ(z, tails)) * 100;
  });
  if (cDeepConf) cDeepConf.destroy();
  cDeepConf = new Chart(document.getElementById('cDeepConf'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        ...groups.slice(1).map((g, i) => ({
          label: g.label, data: confData(i + 1),
          borderColor: groupColor(i + 1), backgroundColor: 'transparent',
          borderWidth: 2, pointRadius: 0, tension: 0.2, spanGaps: true,
        })),
        {
          label: `Threshold ${fmt(adjConf * 100, adjConf * 100 >= 99 ? 1 : 0)}%`,
          data: dates.map(() => adjConf * 100),
          borderColor: '#4e9e7e', borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0, fill: false,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend, tooltip: { callbacks: { label: c => c.raw === null ? null : `${c.dataset.label}: ${fmt(c.raw, 2)}%` } } },
      scales: {
        x: { ticks: xTicks, grid: { display: false } },
        y: { min: 0, max: 100, title: { display: true, text: '1 − p (%) — not confidence', font: { size: 11 } }, ticks: { font: { size: 10 } } },
      },
    },
  });

  // Uplift over time: cumulative line + likely range, weekly dots
  const showBand = groups.length === 2;
  const upliftSets = [];
  const yValues = [];
  groups.slice(1).forEach((g, i) => {
    const gi = i + 1, color = groupColor(gi);
    const line = [], lo = [], hi = [];
    dates.forEach((_, d) => {
      const n1 = cum[0].n[d], c1 = cum[0].c[d], n2 = cum[gi].n[d], c2 = cum[gi].c[d];
      if (n1 < 1 || n2 < 1 || c1 <= 0) { line.push(null); lo.push(null); hi.push(null); return; }
      const p1 = c1 / n1, p2 = c2 / n2;
      const interval = relativeInterval(n1, c1, n2, c2, 1 - adjConf, tails);
      line.push((p2 / p1 - 1) * 100);
      lo.push(interval && Number.isFinite(interval.lower) ? interval.lower * 100 : null);
      hi.push(interval && Number.isFinite(interval.upper) ? interval.upper * 100 : null);
    });
    yValues.push(...line.filter(v => v !== null));
    if (showBand) {
      upliftSets.push(
        { label: '_lo', data: lo, borderColor: 'transparent', backgroundColor: 'transparent', pointRadius: 0, fill: false, tension: 0.2, spanGaps: true },
        { label: '_hi', data: hi, borderColor: 'transparent', backgroundColor: color + '1f', pointRadius: 0, fill: '-1', tension: 0.2, spanGaps: true },
      );
    }
    upliftSets.push({
      label: `${g.label} (so far)`, data: line,
      borderColor: color, backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.2, spanGaps: true,
    });

    // Weekly uplift: each 7-day block on its own, plotted at the block's last day
    const weekly = dates.map(() => null);
    for (let b = 0; b < dates.length; b += 7) {
      const e = Math.min(dates.length, b + 7);
      const n1 = sum(groups[0].n.slice(b, e)), c1 = sum(groups[0].c.slice(b, e));
      const n2 = sum(g.n.slice(b, e)), c2 = sum(g.c.slice(b, e));
      if (n1 > 0 && n2 > 0 && c1 > 0) weekly[e - 1] = ((c2 / n2) / (c1 / n1) - 1) * 100;
    }
    yValues.push(...weekly.filter(v => v !== null));
    upliftSets.push({
      label: `${g.label} (week)`, data: weekly, showLine: false,
      borderColor: color, backgroundColor: color, pointRadius: 4, pointHoverRadius: 6, pointStyle: 'rectRot',
    });
  });

  // Axis from the lines and dots, so very wide early ranges don't flatten everything
  const yMin = Math.min(0, ...yValues), yMax = Math.max(0, ...yValues);
  const pad = Math.max(1, (yMax - yMin) * 0.2);

  if (cDeepUplift) cDeepUplift.destroy();
  cDeepUplift = new Chart(document.getElementById('cDeepUplift'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: '_zero', data: dates.map(() => 0), borderColor: '#9aa1b4', borderWidth: 1, pointRadius: 0, fill: false },
        ...upliftSets,
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend,
        tooltip: {
          filter: item => !item.dataset.label.startsWith('_') && item.raw !== null,
          callbacks: { label: c => `${c.dataset.label}: ${c.raw > 0 ? '+' : ''}${fmt(c.raw, 1)}%` },
        },
      },
      scales: {
        x: { ticks: xTicks, grid: { display: false } },
        y: {
          min: Math.floor(yMin - pad), max: Math.ceil(yMax + pad),
          title: { display: true, text: 'Uplift (%)', font: { size: 11 } },
          ticks: { font: { size: 10 }, callback: v => `${v > 0 ? '+' : ''}${v}%` },
        },
      },
    },
  });
}

// ── Breakdowns ──────────────────────────────────────────────────────────────

function renderBreakdown() {
  const el = document.getElementById('breakdownTable');
  if (!el || !deepData) { if (el) el.innerHTML = ''; return; }
  const { dates, groups } = deepData;
  const { tails } = deepSettings();
  const mode = document.querySelector('input[name="sBreakdown"]:checked')?.value || 'weekday';

  const buckets = new Map();
  dates.forEach((iso, i) => {
    const d = parseLocalDate(iso);
    if (!groups.some(g => g.n[i] > 0)) return;
    let key, label;
    if (mode === 'weekday') { key = (d.getDay() + 6) % 7; label = d.toLocaleDateString(undefined, { weekday: 'long' }); }
    else if (mode === 'dom') { key = d.getDate(); label = String(key); }
    else { key = d.getFullYear() * 12 + d.getMonth(); label = d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }); }
    if (!buckets.has(key)) buckets.set(key, { key, label, days: 0, n: groups.map(() => 0), c: groups.map(() => 0) });
    const b = buckets.get(key);
    b.days++;
    groups.forEach((g, gi) => { b.n[gi] += g.n[i]; b.c[gi] += g.c[i]; });
  });

  const rows = [...buckets.values()].sort((a, b) => a.key - b.key);
  const maxVis = Math.max(1, ...rows.map(r => sum(r.n)));
  const head = { weekday: 'Weekday', dom: 'Day', month: 'Month' }[mode];
  const variantsHead = groups.slice(1).map(g =>
    `<th class="num">${escapeHtml(g.label)} rate</th><th class="num">Uplift</th><th class="num">1 − p (not confidence)</th>`).join('');

  el.innerHTML = `
    <table class="bd-table">
      <thead><tr><th>${head}</th><th class="num">Days</th><th class="num">Visitors</th><th class="num">${escapeHtml(groups[0].label)} rate</th>${variantsHead}</tr></thead>
      <tbody>${rows.map(r => {
        const vis = sum(r.n);
        const p1 = r.n[0] > 0 ? r.c[0] / r.n[0] : 0;
        const cells = groups.slice(1).map((_, i) => {
          const gi = i + 1;
          const p2 = r.n[gi] > 0 ? r.c[gi] / r.n[gi] : 0;
          if (!(r.n[0] > 0 && r.n[gi] > 0 && p1 > 0)) return '<td class="num">—</td><td class="num">—</td><td class="num">—</td>';
          const up = p2 / p1 - 1;
          const { z } = zTest(r.n[0], r.c[0], r.n[gi], r.c[gi]);
          const conf = (1 - pFromZ(z, tails)) * 100;
          return `<td class="num">${fmtPct(p2)}</td><td class="num ${up > 0 ? 'pos' : up < 0 ? 'neg' : ''}">${signPct(up)}</td><td class="num bd-muted">${fmt(conf, 0)}%</td>`;
        }).join('');
        return `<tr>
          <td>${escapeHtml(r.label)}</td>
          <td class="num">${r.days}</td>
          <td class="num bd-vis"><span class="bd-bar" style="width:${(vis / maxVis * 100).toFixed(1)}%"></span><span>${vis.toLocaleString()}</span></td>
          <td class="num">${fmtPct(p1)}</td>${cells}
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}
