// ─────────────────────────────────────────────────────────────────────────────
// PASTE IMPORT
// Adobe Analysis Workspace (A4T panel / freeform table), Target CSV, Excel, Sheets
// ─────────────────────────────────────────────────────────────────────────────

const IMPORT_MAX_GROUPS = 6; // control + 5 variants

let importModel = null;

// Parses "1,614", "1.614", "1 614", "12,5%", "4.89" … into { value, isPct }.
// A single separator followed by exactly 3 digits is read as a thousands separator,
// because the columns we care about are counts.
function parseNumberCell(raw) {
  let s = String(raw ?? '').trim().replace(/[\s\u00a0\u202f']/g, '');
  if (!s) return null;
  const isPct = s.endsWith('%');
  if (isPct) s = s.slice(0, -1);
  if (!/^[-+]?(\d|[.,]\d)[\d.,]*$/.test(s)) return null;

  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    s = s.split(dec === '.' ? ',' : '.').join('').replace(dec, '.');
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const parts = s.replace(/^[-+]/, '').split(sep);
    const grouped = parts.length > 2 ||
      (parts[0].length >= 1 && parts[0].length <= 3 && parts[0] !== '0' && parts[1].length === 3);
    s = grouped ? s.split(sep).join('') : s.replace(sep, '.');
  }
  const value = parseFloat(s);
  return isFinite(value) ? { value, isPct } : null;
}

function splitDelimitedLine(line, delim) {
  const out = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === '') {
      quoted = true;
    } else if (ch === delim) {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(c => c.trim());
}

function splitTable(text) {
  const lines = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter(l => l.trim() !== '' && !l.trim().startsWith('#')); // Workspace CSVs start with "#" comment lines
  if (!lines.length) return [];
  const count = ch => lines.filter(l => l.includes(ch)).length;
  const delim = count('\t') ? '\t' : count(';') >= count(',') && count(';') ? ';' : ',';
  return lines.map(l => splitDelimitedLine(l, delim));
}

// Workspace prefixes rows with "1.", "2." … — those are row numbers, not data
const isRowIndexCell = c => /^\d+\.$/.test(c.trim());
const isTotalLabel   = l => /^(total|totals|gesamt|summe|sum)\b|^(target\s+)?(experiences|activities)$/i.test(l.trim());

// Dates as exported by Workspace, Excel or Sheets → 'YYYY-MM-DD' (or null).
// Accepts 2026-10-20, 20.10.2026, 10/20/2026 (20/10/2026 if the first part > 12),
// "Oct 20, 2026", "20 Oct 2026", "20. Okt. 2026", optionally prefixed with a weekday.
const MONTHS = { jan:0, feb:1, mar:2, mär:2, maer:2, apr:3, may:4, mai:4, jun:5, jul:6, aug:7, sep:8, oct:9, okt:9, nov:10, dec:11, dez:11 };

function parseDateCell(raw) {
  const s = String(raw ?? '').trim().replace(/^(mon|tue|wed|thu|fri|sat|sun|mo|di|mi|do|fr|sa|so)[a-zäöü]*\.?,?\s+/i, '');
  let y, m, d, x;
  if ((x = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(s))) [y, m, d] = [+x[1], +x[2] - 1, +x[3]];
  else if ((x = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s))) [y, m, d] = [+x[3], +x[2] - 1, +x[1]];
  else if ((x = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) {
    const a = +x[1], b = +x[2];
    [y, m, d] = a > 12 ? [+x[3], b - 1, a] : [+x[3], a - 1, b];
  } else if ((x = /^([A-Za-zä]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s))) {
    m = MONTHS[x[1].slice(0, 3).toLowerCase()] ?? MONTHS[x[1].slice(0, 4).toLowerCase()]; [d, y] = [+x[2], +x[3]];
  } else if ((x = /^(\d{1,2})\.?\s+([A-Za-zä]{3,9})\.?,?\s+(\d{4})$/.exec(s))) {
    m = MONTHS[x[2].slice(0, 3).toLowerCase()] ?? MONTHS[x[2].slice(0, 4).toLowerCase()]; [d, y] = [+x[1], +x[3]];
  } else return null;
  if (m === undefined || y < 1990 || y > 2100) return null;
  const dt = new Date(y, m, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m || dt.getDate() !== d) return null;
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Column names: combine all header rows above the data (Workspace stacks metric name + date range)
function countColumns(data, headerRows, width) {
  const columns = [];
  for (let i = 0; i < width; i++) {
    const isCount = data.every(r => r.nums[i] && !r.nums[i].isPct);
    if (!isCount) continue;
    // Header rows narrower than the data (e.g. no row-number column) are aligned to the right
    const name = headerRows
      .map(r => r.cells[i - (width - r.cells.length)] || '')
      .filter(c => c && !parseNumberCell(c))
      .join(' · ');
    columns.push({ index: i, name: name || `Column ${i + 1}` });
  }
  return columns;
}

function detectMapping(columns, labels) {
  const visScore = name =>
    /unique\s*visitors?|eindeutige\s*besucher/i.test(name) ? 4 :
    /visitors?|besucher/i.test(name) ? 3 :
    /visits?|besuche/i.test(name) ? 2 :
    /impressions?|instances?|entries|entrants|participants?|teilnehmer/i.test(name) ? 1 : 0;
  // Without a recognisable header, the leftmost count column is the visitors column
  const visCol = columns.some(c => visScore(c.name) > 0)
    ? [...columns].sort((a, b) => visScore(b.name) - visScore(a.name))[0]
    : columns[0];

  const convPattern = /conversion|konversion|orders?|bestellung|purchase|kauf|lead|sign.?up|success|goal|ziel|click|klick|revenue|umsatz/i;
  const notConv = /rate|rat\b|lift|confidence|konfidenz|average|avg|per\b/i;
  const others = columns.filter(c => c !== visCol);
  const convCol = others.find(c => convPattern.test(c.name) && !notConv.test(c.name))
    || others.find(c => !notConv.test(c.name) && visScore(c.name) === 0)
    || others[0];

  const ctrlPattern = /control|kontroll|default|standard|original|baseline|^experience\s*a\b|^a$/i;
  const ctrlIdx = Math.max(0, labels.findIndex(l => ctrlPattern.test(l)));
  return { visCol: visCol.index, convCol: convCol.index, ctrlIdx };
}

function parseImportRows(table) {
  return table.map(cells => {
    // A date cell is never a count, even if it looks like one ("20.10.2026")
    const dateIdx = cells.findIndex(c => parseDateCell(c));
    const date = dateIdx >= 0 ? parseDateCell(cells[dateIdx]) : null;
    const nums = cells.map((c, i) => (i === dateIdx || isRowIndexCell(c) ? null : parseNumberCell(c)));
    const label = cells.find((c, i) => c && i !== dateIdx && !nums[i] && !isRowIndexCell(c)) || '';
    const counts = nums.filter(n => n && !n.isPct).length;
    return { cells, nums, label, date, counts };
  });
}

function analyzeImport(text) {
  const table = splitTable(text);
  const parsed = parseImportRows(table);
  if (parsed.filter(r => r.date && r.counts >= 2).length >= 2) return analyzeDailyImport(parsed);

  const rows = parsed.map(r => ({ ...r, isData: !!r.label && r.counts >= 2 && !isTotalLabel(r.label) }));

  const firstData = rows.findIndex(r => r.isData);
  if (firstData < 0) return { rows: [], columns: [], error: 'No rows with an experience name and at least two numbers found.' };
  let data = rows.filter(r => r.isData);

  // Drop a totals row regardless of its label: its counts equal the sum of all other rows
  if (data.length >= 3) {
    const countIdx = data[0].nums.map((n, i) => (n && !n.isPct ? i : -1)).filter(i => i >= 0);
    data = data.filter(r => !countIdx.every(i => {
      const others = data.reduce((s, o) => s + (o !== r && o.nums[i] ? o.nums[i].value : 0), 0);
      return Math.abs(others - (r.nums[i]?.value ?? NaN)) <= Math.max(1, others * 0.001);
    }));
  }

  const width = Math.max(...rows.map(r => r.cells.length));
  const headerRows = rows.slice(0, firstData).filter(r => !r.isData);
  const columns = countColumns(data, headerRows, width);
  if (columns.length < 2) return { rows: [], columns: [], error: 'Need at least two count columns (visitors and conversions).' };

  return {
    rows: data.map(r => ({ label: r.label, nums: r.nums })),
    columns,
    ...detectMapping(columns, data.map(r => r.label)),
  };
}

// Daily layout: one row per group and day, e.g. Adobe Workspace with Experience → Day.
// Total rows (no date, or "Day" in the date column) are used for the card totals,
// because unique visitors can't be summed across days.
function analyzeDailyImport(parsed) {
  const dated = parsed.filter(r => r.date && r.label && r.counts >= 2 && !isTotalLabel(r.label));
  if (!dated.length) {
    return { rows: [], columns: [], error: 'Found dates, but no group names next to them. Use one row per day and group (e.g. Adobe Workspace: Experience → Day).' };
  }

  const width = Math.max(...parsed.map(r => r.cells.length));
  const firstIdx = parsed.indexOf(dated[0]);
  const headerRows = parsed.slice(0, firstIdx).filter(r => !r.date && r.counts < 2);
  const columns = countColumns(dated, headerRows, width);
  if (columns.length < 2) return { rows: [], columns: [], error: 'Need at least two count columns (visitors and conversions).' };

  const labels = [...new Set(dated.map(r => r.label))];
  const rows = labels.map(label => {
    const total = parsed.find(r => !r.date && r.label === label && columns.every(c => r.nums[c.index] && !r.nums[c.index].isPct));
    if (total) return { label, nums: total.nums, fromTotal: true };
    const nums = Array(width).fill(null);
    columns.forEach(c => {
      nums[c.index] = { value: dated.filter(r => r.label === label).reduce((s, r) => s + r.nums[c.index].value, 0), isPct: false };
    });
    return { label, nums, fromTotal: false };
  });

  const dates = [...new Set(dated.map(r => r.date))].sort();
  const spanDays = Math.round((new Date(dates[dates.length - 1]) - new Date(dates[0])) / 86400000) + 1;
  if (spanDays > 3660) return { rows: [], columns: [], error: 'Dates span more than 10 years — check the date column.' };

  return {
    rows,
    columns,
    ...detectMapping(columns, labels),
    daily: { dated: dated.map(r => ({ label: r.label, date: r.date, nums: r.nums })), from: dates[0], to: dates[dates.length - 1], spanDays },
  };
}

// Day-by-day arrays per group (control first, gaps filled with zeros)
function buildDailyData(model, groupLabels) {
  const { dated, from, spanDays } = model.daily;
  const start = parseLocalDate(from);
  const dates = Array.from({ length: spanDays }, (_, i) =>
    localDateStr(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
  const index = new Map(dates.map((d, i) => [d, i]));
  const groups = groupLabels.map(label => ({ label, n: Array(spanDays).fill(0), c: Array(spanDays).fill(0) }));
  dated.forEach(r => {
    const g = groups.find(x => x.label === r.label);
    const i = index.get(r.date);
    if (!g || i === undefined) return;
    g.n[i] += Math.round(r.nums[model.visCol]?.value || 0);
    g.c[i] += Math.round(r.nums[model.convCol]?.value || 0);
  });
  return { dates, groups };
}

// ── Dialog ──────────────────────────────────────────────────────────────────

function openImport(prefill) {
  const dlg = document.getElementById('importDialog');
  const ta = document.getElementById('importText');
  if (typeof prefill === 'string') ta.value = prefill;
  onImportInput();
  if (!dlg.open) dlg.showModal();
  if (!ta.value) ta.focus();
}

function closeImport() {
  document.getElementById('importDialog').close();
}

function fillSelect(sel, options, selected) {
  sel.innerHTML = options.map(o => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('');
  sel.value = String(selected);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function onImportInput() {
  const text = document.getElementById('importText').value;
  importModel = text.trim() ? analyzeImport(text) : null;

  const ok = importModel && importModel.rows.length >= 2;
  document.getElementById('importMap').style.display = ok ? '' : 'none';
  if (ok) {
    const colOpts = importModel.columns.map(c => ({ value: c.index, label: c.name }));
    fillSelect(document.getElementById('importVisCol'), colOpts, importModel.visCol);
    fillSelect(document.getElementById('importConvCol'), colOpts, importModel.convCol);
    fillSelect(document.getElementById('importCtrlRow'),
      importModel.rows.map((r, i) => ({ value: i, label: r.label })), importModel.ctrlIdx);
  }
  renderImportPreview();
}

function onImportMapChange() {
  if (!importModel) return;
  importModel.visCol  = parseInt(document.getElementById('importVisCol').value);
  importModel.convCol = parseInt(document.getElementById('importConvCol').value);
  importModel.ctrlIdx = parseInt(document.getElementById('importCtrlRow').value);
  renderImportPreview();
}

// Control first, then the remaining rows in their original order
function importGroups(model) {
  const ctrl = model.rows[model.ctrlIdx];
  const rest = model.rows.filter((_, i) => i !== model.ctrlIdx);
  return [ctrl, ...rest].map(r => ({
    label: r.label,
    n: Math.round(r.nums[model.visCol].value),
    c: Math.round(r.nums[model.convCol].value),
  }));
}

function renderImportPreview() {
  const status = document.getElementById('importStatus');
  const preview = document.getElementById('importPreview');
  const apply = document.getElementById('importApply');
  const text = document.getElementById('importText').value.trim();

  if (!text) {
    status.className = 'import-status';
    status.textContent = 'Tip: you can also press Ctrl/⌘+V anywhere on the page.';
    preview.innerHTML = '';
    apply.disabled = true;
    return;
  }
  if (!importModel || importModel.rows.length < 2) {
    status.className = 'import-status import-status--err';
    status.textContent = importModel?.error || 'Need at least two rows (control + one variant).';
    preview.innerHTML = '';
    apply.disabled = true;
    return;
  }

  const groups = importGroups(importModel);
  const used = groups.slice(0, IMPORT_MAX_GROUPS);
  const sameCol = importModel.visCol === importModel.convCol;
  const msgs = [];
  if (groups.length > IMPORT_MAX_GROUPS) msgs.push(`Only the first ${IMPORT_MAX_GROUPS - 1} variants are imported (max. 5).`);
  if (sameCol) msgs.push('Visitors and conversions use the same column.');
  status.className = 'import-status' + (sameCol ? ' import-status--err' : msgs.length ? ' import-status--warn' : ' import-status--ok');
  const daily = importModel.daily;
  const dailyTxt = daily
    ? ` Daily data: ${daily.spanDays} days (${fmtShortDate(daily.from)} – ${fmtShortDate(daily.to)}) — opens the Deep dive.`
      + (importModel.rows.some(r => r.fromTotal) ? ' Card totals come from the total rows.' : '')
    : '';
  status.textContent = (msgs.length ? msgs.join(' ') : `${used.length} groups detected — check the mapping, then apply.`) + dailyTxt;

  const fmtInt = n => n.toLocaleString();
  preview.innerHTML = `
    <table>
      <thead><tr><th>Row</th><th>→ Card</th><th class="num">Visitors</th><th class="num">Conversions</th><th class="num">Rate</th></tr></thead>
      <tbody>${groups.map((g, i) => `
        <tr class="${i >= IMPORT_MAX_GROUPS ? 'skipped' : ''}">
          <td>${escapeHtml(g.label)}</td>
          <td>${i === 0 ? '<strong>Control</strong>' : i < IMPORT_MAX_GROUPS ? `Variant ${String.fromCharCode(64 + i)}` : 'skipped'}</td>
          <td class="num">${fmtInt(g.n)}</td>
          <td class="num">${fmtInt(g.c)}</td>
          <td class="num">${g.n > 0 ? (g.c / g.n * 100).toFixed(2) + '%' : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  apply.disabled = sameCol;
}

function applyImport() {
  if (!importModel || importModel.rows.length < 2) return;
  const groups = importGroups(importModel).slice(0, IMPORT_MAX_GROUPS);

  _restoring = true;
  [...variants].forEach(vr => removeVariant(vr.id));
  nextIdx = 0; // restart variant letters at A
  for (let i = 1; i < groups.length; i++) addVariant();

  const ids = allGroupIds();
  const total = groups.reduce((s, g) => s + g.n, 0);
  groups.forEach((g, i) => {
    document.getElementById(ids[i] + '-n').value = g.n;
    document.getElementById(ids[i] + '-c').value = g.c;
    setKnobDisplay(ids[i], total > 0 ? Math.round(g.n / total * 100) : Math.round(100 / ids.length));
  });
  document.getElementById('sTotalVis').value = total;

  // Let the projection pick up the observed uplift from the new data
  delete document.getElementById('scUplift').dataset.manual;

  if (importModel.daily) {
    setDeepData(buildDailyData(importModel, groups.map(g => g.label)));
    document.getElementById('scSinceDate').value = importModel.daily.from;
    applySinceDate();
    document.getElementById('deepToggle').checked = true;
    toggleDeepDive(true, true);
  } else {
    // Totals-only import: old daily data no longer matches the cards
    setDeepData(null);
  }

  _restoring = false;
  recalc();
  closeImport();
}

// Paste anywhere outside a form field opens the importer pre-filled
document.addEventListener('paste', e => {
  if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  const text = e.clipboardData?.getData('text/plain');
  if (!text) return;
  const model = analyzeImport(text);
  if (model.rows.length < 2) return;
  e.preventDefault();
  openImport(text);
});
