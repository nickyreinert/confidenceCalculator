let exampleState = null;
const EXAMPLE_DATA = [
  { n1: 1000, c1: 100, n2: 1000, c2: 112 },
  { n1: 1000, c1: 100, n2: 1000, c2: 150 }
];

function preserveExampleData(data, encoded) {
  if (!exampleState) return false;
  if (data) exampleState.deepData = data;
  exampleState.deepEncoded = encoded;
  exampleState.deepPending = '';
  return true;
}

function exampleComparison() {
  return EXAMPLE_DATA.map(data => {
    const interval = relativeInterval(data.n1, data.c1, data.n2, data.c2);
    const p = pFromZ(zTest(data.n1, data.c1, data.n2, data.c2).z, 2);
    const excludes = interval.lower > 0 || interval.upper < 0;
    const extent = Math.max(Math.abs(interval.lower), Math.abs(interval.upper), 0.1) * 1.15;
    const position = value => 50 + value / extent * 50;
    return `<section class="example-comparison">
      <strong>${excludes ? 'Excludes zero' : 'Includes zero'} · ${p < 0.05 ? 'Significant' : 'Not significant'}</strong>
      <p>Illustrative: control ${data.c1}/${data.n1} (${fmtPct(data.c1/data.n1)}), variant ${data.c2}/${data.n2} (${fmtPct(data.c2/data.n2)}).</p>
      <p>Observed relative uplift: +${fmt(interval.uplift*100,1)}%<br>95% confidence interval: ${intervalText(interval)}<br>p = ${fmt(p,6)}; α = 5%.</p>
      <div class="interval-plot" role="img" aria-label="95% relative uplift confidence interval ${intervalText(interval)}; ${excludes ? 'excludes' : 'includes'} zero">
        <span class="interval-zero">0%</span>
        <span class="interval-range" style="left:${position(interval.lower)}%;width:${position(interval.upper)-position(interval.lower)}%"></span>
        <span class="interval-estimate" style="left:${position(interval.uplift)}%"></span>
      </div>
    </section>`;
  }).join('');
}

function startExample() {
  if (exampleState) return;
  if (typeof endTour === 'function') endTour();
  const inputs = [...document.querySelectorAll('input')].map(element => ({
    element, value: element.value, checked: element.checked, manual: element.dataset.manual
  }));
  const columns = variants.map(variant => document.getElementById('col-' + variant.id));
  exampleState = {
    inputs, columns, variants: variants.slice(), nextIdx,
    deepData, deepEncoded, deepPending, url: location.href,
    focus: document.activeElement, step: 0,
    collapsed: document.querySelector('.dashboard').classList.contains('sidebar-collapsed'),
    calc: document.getElementById('calcToggle').dataset.state,
    hint: document.getElementById('scSinceHint').textContent,
    restoring: _restoring
  };
  _restoring = true;
  columns.forEach(column => column.remove());
  variants = [];
  nextIdx = 0;
  deepData = null;
  deepEncoded = '';
  deepPending = '';
  addVariant();
  const data = EXAMPLE_DATA[0];
  document.getElementById('ctrl-n').value = data.n1;
  document.getElementById('ctrl-c').value = data.c1;
  document.getElementById(variants[0].id + '-n').value = data.n2;
  document.getElementById(variants[0].id + '-c').value = data.c2;
  document.getElementById('sTotalVis').value = data.n1 + data.n2;
  setKnobDisplay('ctrl', 50);
  setKnobDisplay(variants[0].id, 50);
  for (const [name, value] of [['sConf', '0.95'], ['sPower', '0.80'], ['sType', '2']]) {
    document.querySelector(`input[name="${name}"][value="${value}"]`).checked = true;
  }
  document.getElementById('scUplift').value = 20;
  document.getElementById('scSince').value = 14;
  clearSinceDate();
  document.getElementById('projToggle').checked = true;
  toggleProjection(true, true);
  document.getElementById('deepToggle').checked = false;
  toggleDeepDive(false, true);
  toggleSidebar(false, true);
  setCalcMode('on', true);
  recalc();
  document.getElementById('exampleBanner').hidden = false;
  const dialog = document.createElement('dialog');
  dialog.id = 'exampleDialog';
  dialog.className = 'example-dialog';
  dialog.setAttribute('aria-labelledby', 'exampleTitle');
  dialog.setAttribute('aria-describedby', 'exampleText');
  dialog.innerHTML = `<span class="tour-count" id="exampleCount"></span>
    <h2 class="tour-title" id="exampleTitle" tabindex="-1"></h2>
    <div class="tour-text" id="exampleText"></div>
    <div class="example-context" id="exampleContext"></div>
    <div class="tour-actions">
      <button type="button" class="import-btn" id="examplePrevious" onclick="exampleGo(-1)">Previous</button>
      <button type="button" class="import-btn import-btn--primary" id="exampleNext" onclick="exampleGo(1)">Next</button>
      <button type="button" class="import-btn" onclick="exitExample()">Exit example mode</button>
    </div>`;
  document.body.append(dialog);
  dialog.addEventListener('cancel', event => { event.preventDefault(); exitExample(); });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      exitExample();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      exampleGo(event.key === 'ArrowRight' ? 1 : -1);
    }
  });
  dialog.showModal();
  showExampleStep();
}

function exampleGo(direction) {
  if (!exampleState) return;
  exampleState.step = Math.max(0, Math.min(2, exampleState.step + direction));
  showExampleStep();
}

function showExampleStep() {
  const id = variants[0].id;
  const steps = [
    {
      title: 'Power — Would we detect an effect that matters?',
      text: '<p>IF a real effect of the SPECIFIED SIZE exists, 80 out of 100 comparable experiments would detect it as statistically significant at 80% power.</p><p>Here the separately assumed relevant effect is +20% relative uplift: a 10% baseline would become 12%. The observed uplift is not the power assumption. The calculated power below uses 1,000 visitors per group and α = 5%. The selected 80% is a target, not a claim that this sample has already reached it.</p><p>Power is not the probability this result is correct. Adequate power does not establish sufficient calendar duration or justify repeated checking and stopping at significance.</p>',
      selectors: ['#scUplift', '#ctrl-n', '#' + id + '-n', '#currentPower'],
      context: `<strong>Assumed effect: +20% · Visitors: 1,000 / 1,000</strong><p>${document.getElementById('currentPower').textContent}</p>`
    },
    {
      title: 'Significance — Do we have evidence against zero effect?',
      text: '<p>IF there is NO REAL EFFECT, a 5% significance level means about 5 out of 100 comparable experiments would falsely report a statistically significant difference.</p><p>α = 5% is the chosen threshold. The p-value comes from the data. A p-value below α gives a significant decision: evidence against zero effect, not proof. Not significant does not establish no effect.</p>',
      selectors: ['#confRadios', '#significance-' + id],
      context: document.getElementById('significance-' + id).innerHTML
    },
    {
      title: 'Confidence interval — How precisely have we estimated the effect?',
      text: '<p>Repeat the experiment and calculate a NEW interval each time. About 95 out of 100 intervals constructed using a 95% confidence method would contain the TRUE effect, which could be positive, negative, or zero.</p><p>A single uplift is a point estimate, not a guaranteed or repeatable outcome. 95% confidence corresponds to α = 5% here. It is not a 95% probability the variant wins or the measured uplift will repeat, nor does it mean 95% of future results fall inside today’s interval.</p><p>These are two different illustrative datasets, not repeated experiments with a changing “true effect”. Both intervals and decisions are calculated from the counts.</p>',
      selectors: ['#effect-' + id],
      context: exampleComparison()
    }
  ];
  const step = steps[exampleState.step];
  document.querySelectorAll('.example-highlight').forEach(element => element.classList.remove('example-highlight'));
  step.selectors.forEach(selector => document.querySelector(selector)?.classList.add('example-highlight'));
  document.querySelector(step.selectors[0])?.scrollIntoView({ block: 'center', inline: 'nearest' });
  document.getElementById('exampleCount').textContent = `Illustrative data · ${exampleState.step + 1} / 3`;
  document.getElementById('exampleTitle').textContent = step.title;
  document.getElementById('exampleText').innerHTML = step.text;
  document.getElementById('exampleContext').innerHTML = step.context;
  document.getElementById('examplePrevious').disabled = exampleState.step === 0;
  document.getElementById('exampleNext').disabled = exampleState.step === 2;
  document.getElementById('exampleDialog').scrollTop = 0;
  document.getElementById('exampleTitle').focus({ preventScroll: true });
}

function exitExample() {
  if (!exampleState) return;
  const saved = exampleState;
  document.getElementById('exampleDialog')?.close();
  document.getElementById('exampleDialog')?.remove();
  document.querySelectorAll('.example-highlight').forEach(element => element.classList.remove('example-highlight'));
  variants.forEach(variant => document.getElementById('col-' + variant.id)?.remove());
  variants = saved.variants;
  nextIdx = saved.nextIdx;
  saved.columns.forEach(column => document.getElementById('groupsGrid').insertBefore(column, document.querySelector('.group-col--add')));
  saved.inputs.forEach(({ element, value, checked, manual }) => {
    element.value = value;
    element.checked = checked;
    if (manual === undefined) delete element.dataset.manual;
    else element.dataset.manual = manual;
  });
  deepData = saved.deepData;
  deepEncoded = saved.deepEncoded;
  deepPending = saved.deepPending;
  allGroupIds().forEach(id => setKnobDisplay(id, document.getElementById(id + '-dist').value));
  setCalcMode(saved.calc, true);
  toggleSidebar(saved.collapsed, true);
  toggleProjection(document.getElementById('projToggle').checked, true);
  toggleDeepDive(document.getElementById('deepToggle').checked, true);
  document.getElementById('scSinceHint').textContent = saved.hint;
  document.getElementById('exampleBanner').hidden = true;
  recalc();
  history.replaceState(null, '', saved.url);
  _restoring = saved.restoring;
  exampleState = null;
  saved.focus?.focus({ preventScroll: true });
}