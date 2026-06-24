// Inject sidebar HTML into the page on first load
(function mountSidebar() {
  fetch('sidebar.html')
    .then(r => r.text())
    .then(html => {
      const el = document.createElement('div');
      el.innerHTML = html;
      document.body.appendChild(el.firstElementChild);
    });
})();

function openConcept(id) {
  const concept = CONCEPTS[id];
  if (!concept) return;
  document.getElementById('sidebarLabel').textContent = concept.label;
  document.getElementById('sidebarBody').innerHTML = concept.deep;
  const sidebar = document.getElementById('conceptSidebar');
  sidebar.classList.add('is-open');
  sidebar.setAttribute('aria-hidden', 'false');
  // no scroll lock — bottom sheet doesn't need it, content stays visible
}

function closeSidebar() {
  const sidebar = document.getElementById('conceptSidebar');
  sidebar.classList.remove('is-open');
  sidebar.setAttribute('aria-hidden', 'true');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSidebar();
});

// ── Floating tooltip for all [data-tooltip] elements ──────────────────────────
(function initTooltip() {
  const tip = document.createElement('div');
  tip.className = 'tip';
  document.body.appendChild(tip);

  let current = null;

  function show(el) {
    const text = el.getAttribute('data-tooltip');
    if (!text) return;
    current = el;
    tip.textContent = text;
    tip.classList.add('tip--visible');
    position(el);
  }

  function hide() {
    current = null;
    tip.classList.remove('tip--visible');
  }

  function position(el) {
    const r = el.getBoundingClientRect();
    const tw = 240, gap = 8;
    // prefer above; fall back to below if no room
    let top = r.top - tip.offsetHeight - gap;
    if (top < 4) top = r.bottom + gap;
    let left = r.left + r.width / 2 - Math.min(tip.offsetWidth, tw) / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - Math.min(tip.offsetWidth, tw) - 8));
    tip.style.top = top + 'px';
    tip.style.left = left + 'px';
  }

  // Use event delegation so dynamically injected buttons (result cards) work too
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-tooltip]');
    if (el && el !== current) show(el);
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest('[data-tooltip]')) hide();
  });
  document.addEventListener('click', e => {
    if (e.target.closest('[data-tooltip]')) hide();
  });
  document.addEventListener('scroll', hide, true);
})();
