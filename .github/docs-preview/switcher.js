/* global common, palettes, URL, location, document, localStorage, MutationObserver, history, window, navigator */
// Bundled with palettes.json only by docs-preview.mjs; never shipped in docs/.
const url = new URL(location.href);
const root = document.documentElement;
const storageKey = 'fluent-measures:palette';
const valid = value => palettes.some(p => p.id === value);
let saved;
try {
  saved = localStorage.getItem(storageKey);
} catch {
  // The URL remains repeatable when storage is unavailable.
}
const requested = url.searchParams.get('palette');
let selected =
  requested !== null ? (valid(requested) ? requested : 'atlas') : valid(saved) ? saved : 'atlas';
let previousKeys = [];
const apply = () => {
  previousKeys.forEach(key => root.style.removeProperty(`--${key}`));
  const palette = palettes.find(p => p.id === selected && p.id !== 'atlas');
  const mode = root.dataset.theme === 'dark' ? 'dark' : 'light';
  const colors = palette
    ? { ...(selected === 'original' ? {} : common[mode]), ...palette[mode] }
    : {};
  Object.entries(colors).forEach(([key, value]) => root.style.setProperty(`--${key}`, value));
  previousKeys = Object.keys(colors);
  root.dataset.palette = selected;
  if (palette) {
    document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
      meta.content = colors.bg;
    });
  }
};
apply();
new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
const initialize = () => {
  const panel = document.createElement('section');
  panel.className = 'palette-preview';
  panel.setAttribute('aria-label', 'Palette preview');
  panel.innerHTML = `<div class="palette-preview-inner">
    <div class="palette-preview-choice"><label for="palette-choice">Palette preview</label>
    <select id="palette-choice" aria-describedby="palette-help">${palettes.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
    <span class="palette-swatches" aria-hidden="true"><i></i><i></i><i></i></span></div>
    <div class="palette-preview-actions"><button type="button" data-palette-reset>Reset to Atlas</button><button type="button" data-palette-link>Copy link</button><a data-palette-exit>Exit preview</a></div>
    <p id="palette-help">Atlas is the production default. Only this preview changes. Use the header theme control for Light, System or Dark.</p>
    <p class="palette-preview-status" role="status" aria-live="polite"></p>
  </div>`;
  document.querySelector('.site-header').insertAdjacentElement('afterend', panel);
  const select = panel.querySelector('select');
  const status = panel.querySelector('[role="status"]');
  select.value = selected;
  const updateUrl = () => {
    const next = new URL(location.href);
    next.searchParams.set('palette', selected);
    try {
      history.replaceState(null, '', next);
    } catch {
      /* file URLs can restrict history. */
    }
    return next.href;
  };
  const choose = value => {
    selected = value;
    select.value = value;
    try {
      if (value === 'atlas') localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, value);
    } catch {
      /* Storage is optional. */
    }
    // Restore the production browser chrome color before applying a candidate.
    window.fluentMeasuresTheme();
    apply();
    updateUrl();
    status.textContent =
      value === 'atlas' ? 'Reset to Atlas.' : `${select.selectedOptions[0].textContent} selected.`;
  };
  select.addEventListener('change', () => choose(select.value));
  panel.querySelector('[data-palette-reset]').addEventListener('click', () => choose('atlas'));
  const exit = new URL('../docs/index.html', location.href);
  const exitLink = panel.querySelector('[data-palette-exit]');
  const updateExit = () => {
    exit.hash = location.hash;
    exitLink.href = exit.href;
  };
  updateExit();
  exitLink.addEventListener('click', updateExit);
  panel.querySelector('[data-palette-link]').addEventListener('click', async () => {
    const link = updateUrl();
    try {
      await navigator.clipboard.writeText(link);
      status.textContent = 'Preview link copied.';
    } catch {
      status.textContent = '';
      const fallback = document.createElement('a');
      fallback.href = link;
      fallback.textContent = 'Open preview link to copy';
      status.append(fallback);
    }
  });
};
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
  initialize();
}
