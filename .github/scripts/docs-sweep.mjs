// pnpm docs:sweep [page] [--from 320] [--to 1600] [--step 10] [--touch]
//
// Loads the docs page in the system Chrome, once in each color scheme, and resizes it through
// each width from --from to --to (AFA-186). At each width it reports layout problems: the page or
// a code block that needs a sideways scroll, content that a box clips or that runs off the
// screen, input chips that run into their results, values that wrap, and navigation that is
// missing or collides. The page defaults to docs/index.html. --touch emulates a touch screen.
//
// It exits 0 when it finds no problem, 1 when it finds one, and 2 when it can't run. The checks
// use the class names of docs/index.html, so a change to those names needs a change here.
import {
  EXIT_ERROR,
  formatPlaces,
  launchChrome,
  pageUrl,
  requireChrome,
  sleep,
  sweepOptions,
  sweepWidths,
} from './docs-chrome.mjs';

/** Runs in the page. Returns a list of the problems at the current width, without repeats. */
function probe() {
  const out = [];
  const vis = el =>
    el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const name = el => {
    const art = el.closest('article, section');
    const h = art?.querySelector('h2, h3, h4');
    const tag =
      el.className && typeof el.className === 'string'
        ? '.' + el.className.split(' ')[0]
        : el.tagName;
    return tag + ' @' + (el.closest('.hd, [id]')?.id || h?.id || '?') + (h ? '/' + h.id : '');
  };
  // An element that the checks need. A missing one is a problem too.
  const need = selector => {
    const el = document.querySelector(selector);
    if (!el) out.push('MISSING ' + selector);
    return el;
  };
  const lines = el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return new Set([...range.getClientRects()].map(r => Math.round(r.top))).size;
  };
  const W = innerWidth;
  if (document.documentElement.scrollWidth > W) {
    out.push('PAGE overflow ' + document.documentElement.scrollWidth);
  }
  // Code blocks and other scrollers: nothing should need a sideways scroll.
  const scrollers =
    '.code pre, .tabs, .install-pill code, .decl, .local-index ul, details[open] > .page-menu-panel';
  document.querySelectorAll(scrollers).forEach(el => {
    if (!vis(el)) return;
    if (el.scrollWidth > el.clientWidth + 1) {
      const text = JSON.stringify(el.textContent.trim().slice(0, 40));
      out.push('SCROLL ' + name(el) + ' ' + el.scrollWidth + '>' + el.clientWidth + ' ' + text);
    }
  });
  // Clipping containers.
  const boxes =
    '.code, .table-wrap, .demo, .null-list, .props, .callout, .rules, .topic-grid a, ' +
    '.demo-list > div, .header-bar, .summary, .cases tbody tr, .null-list li, .topic-links a, ' +
    '.api-card, .fold-more';
  document.querySelectorAll(boxes).forEach(el => {
    if (!vis(el)) return;
    if (el.scrollWidth > el.clientWidth + 1) {
      const text = JSON.stringify(el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40));
      out.push('CLIP ' + name(el) + ' ' + el.scrollWidth + '>' + el.clientWidth + ' ' + text);
    }
    const r = el.getBoundingClientRect();
    if (r.right > W + 0.5 || r.left < -0.5) {
      out.push('OFFSCREEN ' + name(el) + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
    }
  });
  // Each chip stays inside its row, and an input never runs into its result.
  document.querySelectorAll('.cases tbody tr:not(.group-head)').forEach(tr => {
    if (!vis(tr)) return;
    const chip = tr.querySelector('.input-chip');
    const res = tr.querySelector('.result');
    if (!chip || !res) return;
    const a = chip.getBoundingClientRect();
    const b = res.getBoundingClientRect();
    const t = tr.getBoundingClientRect();
    if (a.right > t.right - 8) out.push('CHIP-OUT ' + chip.textContent);
    if (a.top < b.bottom - 2 && a.bottom > b.top + 2 && a.right > b.left - 8) {
      out.push('CHIP-HITS-RESULT ' + chip.textContent);
    }
    if (lines(res) > 1) out.push('RESULT-WRAP ' + res.textContent);
  });
  document.querySelectorAll('.input-chip').forEach(chip => {
    if (!vis(chip)) return;
    const box = chip.closest('li, td, th, p');
    if (box && chip.getBoundingClientRect().right > box.getBoundingClientRect().right + 1) {
      out.push('CHIP-OVER ' + chip.textContent);
    }
  });
  // Returns rows: values never wrap, no line starts with a separator dot, and notes line up.
  document.querySelectorAll('.summary').forEach(s => {
    if (!vis(s)) return;
    const val = [...s.children].find(
      k => !k.classList.contains('summary-key') && !k.classList.contains('summary-note')
    );
    const note = s.querySelector('.summary-note');
    const label = s.textContent.trim().slice(0, 30);
    if (val && lines(val) > 1) out.push('VALUE-WRAP ' + label);
    if (note && val) {
      const ownLine = note.getBoundingClientRect().top >= val.getBoundingClientRect().bottom - 2;
      const dot = getComputedStyle(note, '::before');
      const hasDot = dot.content !== 'none' && dot.content !== 'normal';
      if (ownLine && hasDot && dot.position !== 'absolute') out.push('DOT-STARTS-LINE ' + label);
    }
  });
  document.querySelectorAll('.returns').forEach(r => {
    if (!vis(r)) return;
    const notes = [
      ...r.querySelectorAll(':scope .summary-grid .summary-note, :scope > .summary .summary-note'),
    ].filter(vis);
    const keyed = [...r.querySelectorAll('.summary-key')].filter(vis);
    if (keyed.length > 1) {
      const xs = [...new Set(notes.map(n => Math.round(n.getBoundingClientRect().left)))];
      if (xs.length > 1) out.push('NOTES-MISALIGNED ' + xs.join(','));
    }
  });
  // Navigation: a GitHub link and the theme toggle can always be reached, the link exactly once.
  const gh = [document.querySelector('.header-github'), document.querySelector('.menu-github')];
  const shown = gh.filter(el => el && getComputedStyle(el).display !== 'none');
  if (shown.length !== 1) out.push('GITHUB count=' + shown.length);
  const theme = document.querySelector('.theme-menu > summary');
  if (!vis(theme)) out.push('THEME hidden');
  document.querySelectorAll('.header-bar > *, .header-actions > *').forEach(el => {
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    if (r.right > W - 4 || r.left < 0)
      out.push('HEADER-EDGE ' + name(el) + ' ' + Math.round(r.right));
    if (r.height > 60) out.push('HEADER-TALL ' + name(el) + ' ' + r.height);
  });
  need('.header-bar');
  const nav = document.querySelector('.site-nav');
  const actions = need('.header-actions');
  const lastLink = nav?.querySelector('ul')?.lastElementChild;
  if (vis(nav) && lastLink && actions) {
    const last = lastLink.getBoundingClientRect();
    const act = actions.getBoundingClientRect();
    if (last.right > act.left - 4) {
      out.push('NAV-COLLIDES ' + Math.round(last.right) + '>' + Math.round(act.left));
    }
  }
  const brand = need('.brand');
  if (brand && brand.getBoundingClientRect().height > 50) out.push('BRAND-WRAP');
  // Headings and text never poke out of the content column.
  const content = need('.doc-content');
  if (content) {
    const col = content.getBoundingClientRect();
    content.querySelectorAll('*').forEach(el => {
      if (!vis(el) || el.closest('pre, .tabs, .install-pill')) return;
      const r = el.getBoundingClientRect();
      if (r.width && r.right > col.right + 1) {
        const text = JSON.stringify(el.textContent.trim().slice(0, 30));
        out.push('COL-OVER ' + name(el) + ' ' + Math.round(r.right - col.right) + ' ' + text);
      }
    });
  }
  return [...new Set(out)];
}

let options;
let url;
try {
  options = sweepOptions(process.argv.slice(2));
  url = pageUrl(options.page, process.cwd());
} catch (error) {
  console.error(error.message);
  process.exit(EXIT_ERROR);
}

const { from, to, step, touch } = options;
const chrome = requireChrome();
// Each problem, with the places where it appears.
const problems = new Map();
let browser;
try {
  browser = await launchChrome(chrome);
  for (const scheme of ['light', 'dark']) {
    await browser.load(url, { width: from, height: 900, scale: 1, scheme, touch });
    for (const width of sweepWidths(from, to, step)) {
      await browser.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 600,
      });
      await sleep(60);
      for (const problem of await browser.evaluate(`(${probe})()`)) {
        problems.set(problem, [...(problems.get(problem) ?? []), { scheme, width }]);
      }
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = EXIT_ERROR;
} finally {
  await browser?.close();
}

if (process.exitCode !== EXIT_ERROR) {
  for (const [problem, places] of problems) {
    console.log(`${problem} :: ${formatPlaces(places, step)}`);
  }
  if (problems.size) {
    const places = new Set([...problems.values()].flat().map(p => `${p.scheme} ${p.width}`));
    const visited = 2 * sweepWidths(from, to, step).length;
    console.log(`\nProblems at ${places.size} of ${visited} widths, counting each color scheme.`);
    process.exitCode = 1;
  } else {
    console.log(`No problems between ${from} and ${to}px, in light and dark.`);
  }
}
