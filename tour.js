// ─────────────────────────────────────────────────────────────────────────────
// QUICK TOUR — spotlight + short explanation, step by step
// ─────────────────────────────────────────────────────────────────────────────

const $tour = sel => document.querySelector(sel);
const headerToggle = id => () => document.getElementById(id)?.closest('label');

// target: first visible match wins; sidebar: step lives in the (possibly collapsed) sidebar
const TOUR_STEPS = [
  {
    target: [() => $tour('#grp-ctrl')],
    title: 'Control group',
    text: `Your original version. Enter <strong>Visitors</strong> — people who saw it — and <strong>Conversions</strong> — people who did what you want: bought, signed up, clicked.`,
  },
  {
    target: [() => variants[0] && document.getElementById('col-' + variants[0].id), () => $tour('.add-group-btn')],
    title: 'Variant',
    text: `The version you're testing. Same two numbers: visitors and conversions. The result shows up right below. Testing more ideas at once? Add up to 5 variants with <strong>+ Add Variant</strong>.`,
  },
  {
    target: [() => $tour('#confRadios')?.closest('.radio-group')],
    sidebar: true,
    title: 'Confidence',
    text: `How sure you want to be before calling a winner. <strong>95%</strong> is the usual choice. Higher means fewer false wins — but you need more visitors.`,
  },
  {
    target: [() => $tour('#typeRadios')?.closest('.radio-group')],
    sidebar: true,
    title: 'Test type',
    text: `<strong>Two-tailed</strong> checks if the variant is better <em>or</em> worse — the safe default. <strong>One-tailed</strong> only looks in one direction: faster, but blind to the other one.`,
  },
  {
    target: [headerToggle('projToggle')],
    title: 'Projection',
    text: `Shows how your test will likely develop: how long it still needs and how traffic changes the picture. Turn it on to plan ahead instead of guessing.`,
  },
  {
    target: [() => $tour('#powerRadioGroup'), headerToggle('projToggle')],
    sidebar: true,
    title: 'Power — why it matters',
    text: `The chance your test finds a real effect, if there is one. With <strong>80%</strong> you still miss a real winner 1 in 5 times. Too little power and you stop too early and wrongly call it "no effect".`,
    hiddenText: ' Turn on <strong>Projection</strong> to set it.',
  },
  {
    target: [() => $tour('.share-btn[onclick="openImport()"]')],
    title: 'Import from Adobe',
    text: `In Analysis Workspace, build a table with <em>Experience</em> as rows and <em>Unique Visitors</em> plus a conversion metric as columns. Select it, copy (Ctrl/⌘+C) and paste it here — or just press Ctrl/⌘+V anywhere on the page. Excel, Sheets and CSV work too. Nothing leaves your browser.`,
  },
  {
    target: [headerToggle('deepToggle')],
    title: 'Deep dive — why it matters',
    text: `Add a <em>Day</em> breakdown in Adobe (Experience → Day), import it and switch this on. You'll see how the test developed day by day and catch what totals hide: a broken split, an effect that wears off, traffic piling up on a few days. Projections then use your recent traffic, too.`,
  },
];

let tourState = null;   // { i, el, collapsedBefore }
let tourEls = null;

function tourVisible(el) {
  if (!el || el.closest('.proj-hidden')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function buildTourEls() {
  if (tourEls) return tourEls;
  const blocker = document.createElement('div');
  blocker.className = 'tour-blocker';
  const spot = document.createElement('div');
  spot.className = 'tour-spot';
  const card = document.createElement('div');
  card.className = 'tour-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'tourTitle');
  card.innerHTML = `
    <div class="tour-head">
      <span class="tour-count" id="tourCount"></span>
      <button type="button" class="tour-close" onclick="endTour()" aria-label="Close tour">✕</button>
    </div>
    <div class="tour-title" id="tourTitle"></div>
    <div class="tour-text" id="tourText"></div>
    <div class="tour-dots" id="tourDots"></div>
    <div class="tour-actions">
      <button type="button" class="import-btn" id="tourBack" onclick="tourGo(-1)">Back</button>
      <button type="button" class="import-btn import-btn--primary" id="tourNext" onclick="tourGo(1)">Next</button>
    </div>`;
  document.body.append(blocker, spot, card);
  tourEls = { blocker, spot, card };
  return tourEls;
}

function startTour() {
  buildTourEls();
  const dash = document.querySelector('.dashboard');
  tourState = { i: 0, el: null, collapsedBefore: dash.classList.contains('sidebar-collapsed') };
  document.body.classList.add('tour-open');
  showTourStep(0);
}

function endTour() {
  if (!tourState) return;
  // Put the sidebar back the way the user had it
  if (tourState.collapsedBefore && !document.querySelector('.dashboard').classList.contains('sidebar-collapsed')) {
    toggleSidebar(true, true);
  }
  tourState = null;
  document.body.classList.remove('tour-open');
  document.querySelector('.tour-btn')?.focus();
}

function tourGo(delta) {
  if (!tourState) return;
  const next = tourState.i + delta;
  if (next >= TOUR_STEPS.length) { endTour(); return; }
  if (next < 0) return;
  showTourStep(next, delta);
}

function showTourStep(i, dir = 1) {
  const step = TOUR_STEPS[i];
  const dash = document.querySelector('.dashboard');
  if (step.sidebar && dash.classList.contains('sidebar-collapsed')) toggleSidebar(false, true);

  const candidates = step.target.map(f => f()).filter(Boolean);
  const el = candidates.find(tourVisible);
  // Nothing to point at (e.g. hidden section): skip in the current direction
  if (!el) {
    const next = i + dir;
    if (next >= 0 && next < TOUR_STEPS.length) showTourStep(next, dir);
    else endTour();
    return;
  }

  tourState.i = i;
  tourState.el = el;
  const usedFallback = el !== candidates[0];
  document.getElementById('tourCount').textContent = `${i + 1} / ${TOUR_STEPS.length}`;
  document.getElementById('tourTitle').textContent = step.title;
  document.getElementById('tourText').innerHTML = step.text + (usedFallback && step.hiddenText ? step.hiddenText : '');
  document.getElementById('tourDots').innerHTML = TOUR_STEPS
    .map((_, j) => `<span class="${j === i ? 'is-active' : j < i ? 'is-done' : ''}"></span>`).join('');
  document.getElementById('tourBack').style.visibility = i === 0 ? 'hidden' : '';
  document.getElementById('tourNext').textContent = i === TOUR_STEPS.length - 1 ? 'Done' : 'Next';

  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  placeTour();
  // Smooth scrolling moves the target for a moment — follow it
  [120, 300, 600].forEach(ms => setTimeout(placeTour, ms));
  document.getElementById('tourNext').focus({ preventScroll: true });
}

function placeTour() {
  if (!tourState?.el) return;
  const { spot, card } = tourEls;
  const pad = 8, gap = 14, margin = 12;
  const r = tourState.el.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;

  Object.assign(spot.style, {
    top: `${r.top - pad}px`, left: `${r.left - pad}px`,
    width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`,
  });

  const cw = card.offsetWidth, ch = card.offsetHeight;
  const box = { top: r.top - pad, left: r.left - pad, right: r.right + pad, bottom: r.bottom + pad };
  const clampX = x => Math.max(margin, Math.min(x, vw - cw - margin));
  const clampY = y => Math.max(margin, Math.min(y, vh - ch - margin));
  const options = [
    ['right',  box.right + gap + cw <= vw - margin, () => [clampY(r.top), box.right + gap]],
    ['bottom', box.bottom + gap + ch <= vh - margin, () => [box.bottom + gap, clampX(r.left)]],
    ['top',    box.top - gap - ch >= margin,         () => [box.top - gap - ch, clampX(r.left)]],
    ['left',   box.left - gap - cw >= margin,        () => [clampY(r.top), box.left - gap - cw]],
  ];
  const pick = options.find(o => o[1]) || options[1];
  const [top, left] = pick[2]();
  card.style.top = `${clampY(top)}px`;
  card.style.left = `${clampX(left)}px`;
}

window.addEventListener('resize', placeTour);
window.addEventListener('scroll', placeTour, { passive: true, capture: true });
document.addEventListener('keydown', e => {
  if (!tourState) return;
  if (e.key === 'Escape') { e.preventDefault(); endTour(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); tourGo(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); tourGo(-1); }
});
