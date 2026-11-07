// AFA-246: real-browser palette behavior, text/token/control contrast and responsive checks.
// pnpm exec node .github/scripts/docs-palettes.mjs [report.json]
// Regenerates the isolated preview before checking it; production is checked separately below.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import axe from 'axe-core';
import { launchChrome, requireChrome } from './docs-chrome.mjs';
import { generatePreview } from './docs-preview.mjs';

const { palettes } = JSON.parse(
  readFileSync(new URL('../docs-preview/palettes.json', import.meta.url), 'utf8')
);
const names = palettes.map(palette => palette.id);
const base = pathToFileURL(generatePreview()).href;
const production = pathToFileURL(resolve('docs/index.html')).href;
const report = { checks: [], failures: [] };
const browser = await launchChrome(requireChrome());
const check = (condition, message) => {
  if (!condition) report.failures.push(message);
};
const frame = () =>
  browser.evaluate('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))');
async function press(key, code) {
  for (const type of ['keyDown', 'keyUp'])
    await browser.send('Input.dispatchKeyEvent', {
      type,
      key,
      code: key,
      windowsVirtualKeyCode: code,
    });
}
function probe() {
  const style = getComputedStyle(document.documentElement);
  const canvas = document.createElement('canvas').getContext('2d');
  const rgb = value => {
    // Composite translucent tokens over the page, as the browser paints them.
    canvas.fillStyle = style.getPropertyValue('--bg').trim();
    canvas.fillRect(0, 0, 1, 1);
    canvas.fillStyle = value;
    canvas.fillRect(0, 0, 1, 1);
    const color = [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3);
    canvas.clearRect(0, 0, 1, 1);
    return color;
  };
  const color = key => rgb(style.getPropertyValue('--' + key).trim());
  const lum = c =>
    c
      .map(v => v / 255)
      .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (fg, bg) => {
    const a = lum(fg),
      b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const pairs = [];
  const add = (fg, bg, min = 4.5) =>
    pairs.push({ fg, bg, min, ratio: ratio(color(fg), color(bg)) });
  for (const bg of ['bg', 'bg-tint', 'surface', 'surface-muted', 'accent-soft']) {
    for (const fg of [
      'text',
      'text-muted',
      'heading',
      'result-value',
      'accent',
      'accent-hover',
      'null',
      'error',
    ])
      add(fg, bg);
    if (['bg', 'surface'].includes(bg)) add('border-control', bg, 3);
  }
  for (const bg of ['code-bg', 'code-head']) {
    for (const fg of [
      'code-text',
      'code-muted',
      'code-accent',
      'code-null',
      'tok-comment',
      'tok-keyword',
      'tok-string',
      'tok-number',
      'tok-property',
      'tok-punctuation',
    ])
      add(fg, bg);
    add('code-accent', bg, 3);
  }
  add('on-accent', 'accent');
  add('inline-code-text', 'inline-code-bg');
  const failures = pairs.filter(p => p.ratio < p.min);
  const controls = [
    ...document.querySelectorAll(
      '.palette-preview select, .palette-preview button, .palette-preview a'
    ),
  ];
  const overflow = controls
    .filter(el => {
      const r = el.getBoundingClientRect();
      return r.left < 0 || r.right > innerWidth;
    })
    .map(el => el.textContent);
  const result = getComputedStyle(document.querySelector('.result'));
  const tokenCount = document.querySelectorAll('pre .token').length;
  return {
    // Hero outlines supplement labeled buttons; their external contrast is diagnostic.
    // WCAG 1.4.11 Boundaries requires the identifying content and focus indicator.
    decorativeHeroBorder: ratio(color('border-control'), color('bg-tint')),
    pairs,
    failures,
    overflow,
    tokenCount,
    result: { color: result.color, weight: result.fontWeight },
    textMinimum: Math.min(...pairs.filter(p => p.min === 4.5).map(p => p.ratio)),
    controlMinimum: Math.min(...pairs.filter(p => p.min === 3).map(p => p.ratio)),
  };
}
try {
  // AFA-246: comparing palettes must keep the documentation at the same position.
  for (const width of [320, 390, 1440]) {
    for (const scheme of ['light', 'dark']) {
      await browser.load(`${base}?palette=atlas`, {
        width,
        height: 900,
        scale: 1,
        scheme,
      });
      const heroTop = await browser.evaluate(
        `document.querySelector('.hero').getBoundingClientRect().top + scrollY`
      );
      const stableFeedback = async action => {
        await frame();
        const state = await browser.evaluate(`(() => {
          const status = document.querySelector('.palette-preview-status');
          const style = getComputedStyle(status);
          return {
            heroTop: document.querySelector('.hero').getBoundingClientRect().top + scrollY,
            text: status.textContent,
            visible: style.display !== 'none' && style.visibility !== 'hidden' &&
              status.getBoundingClientRect().height > 0,
            polite: status.getAttribute('aria-live') === 'polite'
          };
        })()`);
        check(state.heroTop - heroTop === 0, `${width} ${scheme}: ${action} shifts docs`);
        check(
          state.text.length > 0 && state.visible && state.polite,
          `${width} ${scheme}: ${action} feedback must be visible and announced`
        );
      };
      await browser.evaluate(`const select = document.querySelector('#palette-choice');
        select.value = 'rosewater'; select.dispatchEvent(new Event('change'));`);
      await stableFeedback('palette selection');
      await browser.evaluate(`document.querySelector('[data-palette-reset]').click()`);
      await stableFeedback('Atlas reset');
      await browser.evaluate(`Object.defineProperty(navigator, 'clipboard', {
        configurable: true, value: { writeText: () => Promise.resolve() }
      }); document.querySelector('[data-palette-link]').click();`);
      await stableFeedback('Copy link success');
      await browser.evaluate(`Object.defineProperty(navigator, 'clipboard', {
        configurable: true, value: { writeText: () => Promise.reject(new Error('Unavailable')) }
      }); document.querySelector('[data-palette-link]').click();`);
      await stableFeedback('Copy link fallback');
    }
  }
  for (const name of names) {
    for (const scheme of ['light', 'dark']) {
      const url = `${base}?palette=${name}`;
      await browser.load(url, { width: 1440, height: 900, scale: 1, scheme });
      // Open all disclosure content before measuring; check the initialized controls too.
      await browser.evaluate(
        `document.querySelectorAll('main details').forEach(el=>el.open=true); document.querySelector('[data-demo-more]').click()`
      );
      const colors = await browser.evaluate(`(${probe})()`);
      if (name === 'original') {
        const expected = scheme === 'light' ? '#0f766e' : '#2dd4bf';
        check(
          await browser.evaluate(
            `getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === ${JSON.stringify(expected)}`
          ),
          `Original ${scheme}: legacy teal`
        );
      }
      check(colors.tokenCount > 0, `${name} ${scheme}: syntax highlighting did not initialize`);
      for (const p of colors.failures)
        report.failures.push(
          `${name} ${scheme}: ${p.fg}/${p.bg} = ${p.ratio.toFixed(3)} < ${p.min}`
        );
      await browser.evaluate(axe.source);
      const accessibility = await browser.evaluate(
        `axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}})`
      );
      for (const v of accessibility.violations)
        report.failures.push(
          `${name} ${scheme}: axe ${v.id} ${v.nodes.map(n => n.target).join(';')}`
        );
      for (const width of [320, 390, 768, 1440, 1600]) {
        await browser.send('Emulation.setDeviceMetricsOverride', {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: width < 600,
        });
        const overflow = await browser.evaluate(
          `document.documentElement.scrollWidth>innerWidth || [...document.querySelectorAll('.palette-preview select,.palette-preview button,.palette-preview a')].some(el=>{const r=el.getBoundingClientRect();return r.left<0||r.right>innerWidth})`
        );
        check(!overflow, `${name} ${scheme} ${width}: overflow`);
      }
      report.checks.push({
        name,
        scheme,
        ...colors,
        axeViolations: accessibility.violations,
        axeIncomplete: accessibility.incomplete.map(v => v.id),
      });
      console.log(
        `${name} ${scheme}: text ${colors.textMinimum.toFixed(2)}, control ${colors.controlMinimum.toFixed(2)}, axe ${accessibility.violations.length}`
      );
    }
  }
  await browser.load(`${base}?palette=atlas#usage`, {
    width: 390,
    height: 844,
    scale: 1,
    scheme: 'light',
  });
  await browser.evaluate(`document.querySelector('#palette-choice').focus()`);
  await press('ArrowDown', 40);
  await frame();
  check(
    await browser.evaluate(
      `document.documentElement.dataset.palette==='iris' && localStorage.getItem('fluent-measures:palette')==='iris' && location.search.includes('palette=iris') && location.hash==='#usage'`
    ),
    'keyboard selection, storage and URL'
  );
  await press('Tab', 9);
  check(
    await browser.evaluate(`document.activeElement.matches('[data-palette-reset]')`),
    'select → Reset keyboard order'
  );
  const themeBefore = await browser.evaluate('document.documentElement.dataset.themePref');
  await browser.evaluate(`document.querySelector('.theme-toggle').click()`);
  await frame();
  check(
    await browser.evaluate(
      `document.documentElement.dataset.palette==='iris' && document.documentElement.dataset.theme==='dark'`
    ),
    'theme works independently'
  );
  await browser.evaluate(`document.querySelector('[data-palette-reset]').click()`);
  await frame();
  check(
    await browser.evaluate(
      `document.documentElement.dataset.palette==='atlas' && !document.documentElement.style.getPropertyValue('--accent') && localStorage.getItem('fluent-measures:palette')===null && document.documentElement.dataset.themePref==='dark'`
    ),
    'Atlas reset clears palette overrides without resetting theme'
  );
  check(themeBefore === 'system', 'initial preference follows system');
  await browser.evaluate(
    `document.querySelector('#palette-choice').value='grove'; document.querySelector('#palette-choice').dispatchEvent(new Event('change'))`
  );
  await browser.load(`${base}`, {
    width: 390,
    height: 844,
    scale: 1,
    scheme: 'light',
  });
  check(
    await browser.evaluate(`document.querySelector('#palette-choice').value==='grove'`),
    'saved palette survives reload'
  );
  await browser.load(`${production}?palette-preview=1&palette=grove`, {
    width: 390,
    height: 844,
    scale: 1,
    scheme: 'light',
  });
  check(
    await browser.evaluate(
      `!document.querySelector('.palette-preview') && !document.documentElement.dataset.palette && !document.documentElement.style.getPropertyValue('--accent')`
    ),
    'normal docs ignore saved palette'
  );
  await browser.evaluate('localStorage.clear()');
  for (const page of [base, production]) {
    for (const scheme of ['light', 'dark']) {
      await browser.send('Emulation.setScriptExecutionDisabled', { value: true });
      await browser.load(`${page}?palette-preview=1&palette=grove`, {
        width: 390,
        height: 844,
        scale: 1,
        scheme,
      });
      await browser.send('Emulation.setScriptExecutionDisabled', { value: false });
      const expected = scheme === 'light' ? '#2456b3' : '#8db5ff';
      check(
        await browser.evaluate(
          `!document.querySelector('.palette-preview') && document.querySelector('h1').textContent.length>0 && getComputedStyle(document.documentElement).colorScheme===${JSON.stringify(scheme)} && getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()===${JSON.stringify(expected)}`
        ),
        `no-script Atlas ${scheme} fallback: ${page}`
      );
      const colors = await browser.evaluate(`(${probe})()`);
      for (const pair of colors.failures) {
        report.failures.push(
          `no-script ${scheme}: ${pair.fg}/${pair.bg} = ${pair.ratio.toFixed(3)} < ${pair.min}`
        );
      }
    }
  }
} finally {
  await browser.close();
  const output = process.argv[2] || 'reports/docs-palettes.json';
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2));
}
report.failures.forEach(f => console.error(f));
assert.equal(report.failures.length, 0, `${report.failures.length} palette gate failures`);
