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

function analyzeImport(text) {
  const table = splitTable(text);
  const rows = table.map(cells => {
    const nums = cells.map(c => (isRowIndexCell(c) ? null : parseNumberCell(c)));
    const label = cells.find((c, i) => c && !nums[i] && !isRowIndexCell(c)) || '';
    const counts = nums.filter(n => n && !n.isPct).length;
    return { cells, nums, label, isData: !!label && counts >= 2 && !isTotalLabel(label) };
  });

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

  // Column names: combine all header rows above the first data row (Workspace stacks metric name + date range)
  const width = Math.max(...rows.map(r => r.cells.length));
  const headerRows = rows.slice(0, firstData).filter(r => !r.isData);
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
  if (columns.length < 2) return { rows: [], columns: [], error: 'Need at least two count columns (visitors and conversions).' };

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
  const ctrlIdx = Math.max(0, data.findIndex(r => ctrlPattern.test(r.label)));

  return {
    rows: data.map(r => ({ label: r.label, nums: r.nums })),
    columns,
    visCol: visCol.index,
    convCol: convCol.index,
    ctrlIdx,
  };
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
  status.textContent = msgs.length ? msgs.join(' ') : `${used.length} groups detected — check the mapping, then apply.`;

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
