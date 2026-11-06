// pnpm docs:sweep [page] [--from 320] [--to 1600] [--step 10] [--touch]
//
// Loads the docs page in the system Chrome, once in each color scheme, and resizes it through
// each width from --from to --to (AFA-186). At each width it reports layout problems: the page or
// a code block that needs a sideways scroll, content that a box clips or that runs off the
// screen, input chips that run into their results or the hero demo's arrows, values that wrap,
// and navigation that is missing or collides. It runs the checks again with the hero demo
// expanded, checks that all eight rows append in order, then collapses back to the same four
// curated rows and card height. The page defaults to docs/index.html. --touch emulates a touch screen.
// It also checks no-script anchor visibility with keyboard and pointer at phone/desktop sizes.
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
import { noScriptNavigation } from './docs-no-script-navigation.mjs';

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
  // Hero demo: an input chip or its options never run into the row's arrow (AFA-190).
  const demoList = need('.demo-list');
  if (demoList && !demoList.querySelector(':scope > div')) out.push('MISSING .demo-list > div');
  document.querySelectorAll('.demo-list > div').forEach(row => {
    const dt = row.querySelector('dt');
    const arrow = row.querySelector('.demo-arrow');
    if (!vis(row)) return;
    if (!dt || !arrow) {
      const text = JSON.stringify(row.textContent.trim().replace(/\s+/g, ' ').slice(0, 30));
      out.push('MISSING dt or .demo-arrow in ' + text);
      return;
    }
    const a = arrow.getBoundingClientRect();
    // The chip's box and the lines of text. A block's box can span the arrow's column on a line
    // of its own, so it doesn't count.
    const rects = [...dt.querySelectorAll('.demo-input')].map(el => el.getBoundingClientRect());
    const walker = document.createTreeWalker(dt, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    while (walker.nextNode()) {
      range.selectNodeContents(walker.currentNode);
      rects.push(...range.getClientRects());
    }
    const hits = rects.filter(
      r => r.width && r.right > a.left && r.left < a.right && r.bottom > a.top && r.top < a.bottom
    );
    if (hits.length) {
      const chip = row.querySelector('.demo-input')?.textContent ?? dt.textContent.trim();
      out.push('DEMO-HITS-ARROW ' + JSON.stringify(chip));
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
  const theme = document.querySelector('.theme-toggle');
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

/**
 * Runs in the page. Capture the visible row identities and card geometry on either side of a
 * disclosure click. A missing card or button is a failure, not a skipped check.
 */
async function toggleDemo() {
  const demo = document.querySelector('[data-demo]');
  if (!demo) return '[data-demo]';
  const more = demo.querySelector('[data-demo-more]');
  if (!more) return '[data-demo-more]';
  const snapshot = () => ({
    height: demo.getBoundingClientRect().height,
    rows: [...demo.querySelectorAll('.demo-list > div')]
      .filter(row => row.getClientRects().length && getComputedStyle(row).visibility !== 'hidden')
      .map(row => row.querySelector('.demo-input')?.textContent),
  });
  const before = snapshot();
  more.click();
  await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
  return {
    expanded: more.getAttribute('aria-expanded') === 'true',
    before,
    after: snapshot(),
  };
}

// The ticket preserves these eight examples and their order at every width.
const CURATED_ROWS = ['5\' 11"', 'eighty kilograms', '5 foots 10 inc', 'not a measurement'];
const ALL_ROWS = [...CURATED_ROWS, '150 lbs', 'five foot ten', '72,5 kg', '150-180 lbs'];
const sameRows = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

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
      const found = new Set(await browser.evaluate(`(${probe})()`));
      // The same checks with the hero card expanded. A problem that the collapsed card has too
      // is listed once, without the tag.
      const open = await browser.evaluate(`(${toggleDemo})()`);
      let broken = false;
      if (typeof open === 'string') {
        found.add('MISSING ' + open);
      } else if (!open.expanded) {
        found.add('DEMO-TOGGLE the "Show all 8 examples" button does not expand the card');
        broken = true;
      } else {
        for (const problem of await browser.evaluate(`(${probe})()`)) {
          if (!found.has(problem)) found.add(problem + ' [expanded]');
        }
        if (!sameRows(open.before.rows, CURATED_ROWS)) {
          found.add('DEMO-ROWS the collapsed card does not show the four curated examples');
        }
        if (!sameRows(open.after.rows, ALL_ROWS)) {
          found.add('DEMO-ROWS expansion does not append the remaining four examples in order');
        }
        if (open.after.height <= open.before.height) {
          found.add('DEMO-HEIGHT appended rows do not increase the card height');
        }
        const shut = await browser.evaluate(`(${toggleDemo})()`);
        if (typeof shut === 'string' || shut.expanded) {
          found.add('DEMO-TOGGLE a second press does not collapse the card');
          broken = true;
        } else {
          if (!sameRows(shut.after.rows, CURATED_ROWS)) {
            found.add('DEMO-ROWS collapse does not restore the four curated examples');
          }
          if (Math.round(shut.after.height) !== Math.round(open.before.height)) {
            found.add('DEMO-HEIGHT collapse does not restore the initial card height');
          }
          for (const problem of await browser.evaluate(`(${probe})()`)) {
            if (!found.has(problem)) found.add(problem + ' [collapsed again]');
          }
        }
      }
      // A card that is stuck open would make the next width's collapsed checks wrong.
      if (broken) await browser.load(url, { width, height: 900, scale: 1, scheme, touch });
      for (const problem of found) {
        problems.set(problem, [...(problems.get(problem) ?? []), { scheme, width }]);
      }
    }
  }
  for (const { problem, scheme, width } of await noScriptNavigation(browser, url)) {
    problems.set(problem, [...(problems.get(problem) ?? []), { scheme, width }]);
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
    console.log(
      `\nProblems at ${places.size} theme/width combinations (${visited} layout checks plus no-script navigation).`
    );
    process.exitCode = 1;
  } else {
    console.log(
      `No problems between ${from} and ${to}px, in light and dark, or with no-script navigation at 390 and 1440px.`
    );
  }
}
