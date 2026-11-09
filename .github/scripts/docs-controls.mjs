// AFA-221: independent of navigation/layout gates, so each can run on its own.
// pnpm exec node .github/scripts/docs-controls.mjs [page]
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { launchChrome, pageUrl, requireChrome } from './docs-chrome.mjs';

const EXAMPLES = [
  ['npm', 'npm', 'npm install @afahy/fluent-measures'],
  ['yarn', 'yarn', 'yarn add @afahy/fluent-measures'],
  ['pnpm', 'pnpm', 'pnpm add @afahy/fluent-measures'],
  ['esm', 'ES modules', "import { parseMeasurement } from '@afahy/fluent-measures';"],
  ['cjs', 'CommonJS', "const { parseMeasurement } = require('@afahy/fluent-measures');"],
  ['convert-height', 'Height conversion', '180.34'],
  ['convert-weight', 'Weight conversion', '68.0388555'],
];

async function examplesForPage(browser) {
  const version = await browser.evaluate(
    `document.querySelector('meta[name="docs-package-version"]')?.content ?? ''`
  );
  assert.ok(
    !version || /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version),
    'valid documented version'
  );
  return EXAMPLES.map(([id, label, text]) => [
    id,
    label,
    version && ['npm', 'yarn', 'pnpm'].includes(id) ? `${text}@${version}` : text,
  ]);
}

// Runs with page scripts disabled. Runtime evaluation only inspects the fallback and selects
// its text; it does not initialize the page or repair any of the states being checked.
function staticControls(examples) {
  const problems = [];
  const visible = el => el?.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  if (
    document.querySelector('[role="tab"], [role="tablist"], [role="tabpanel"], [aria-selected]')
  ) {
    problems.push('uninitialized tab semantics or selected states');
  }
  for (const button of document.querySelectorAll('.copy-button, .tab')) {
    if (visible(button) && !button.disabled)
      problems.push('unavailable action: ' + button.outerHTML);
  }
  for (const [id, name, text] of examples) {
    const panel = document.getElementById('panel-' + id);
    const label = document.getElementById(panel?.getAttribute('aria-labelledby'));
    if (!visible(panel) || panel.hidden || panel.getAttribute('role') !== 'group') {
      problems.push(id + ': missing visible static group');
    }
    if (!visible(label) || label.textContent.trim() !== name) problems.push(id + ': missing label');
    const code = panel && [...panel.querySelectorAll('pre code')].find(visible);
    if (!code || !code.textContent.includes(text)) problems.push(id + ': missing example content');
    if (code) {
      getSelection().selectAllChildren(code);
      if (
        getSelection().toString() !== code.textContent ||
        getComputedStyle(code).userSelect === 'none'
      ) {
        problems.push(id + ': text cannot be selected');
      }
      getSelection().removeAllRanges();
    }
  }
  return problems;
}

async function press(browser, key) {
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key });
}

async function click(browser, selector) {
  const point = await browser.evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(selector)});
    button.scrollIntoView({ block: 'center', behavior: 'instant' });
    const rect = button.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`);
  await browser.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    button: 'left',
    clickCount: 1,
    ...point,
  });
  await browser.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    button: 'left',
    clickCount: 1,
    ...point,
  });
}

async function selected(browser, group, id) {
  const state = await browser.evaluate(`(() => {
    const list = document.querySelector('[data-tab-group="${group}"]');
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const active = tabs.filter(tab => tab.getAttribute('aria-selected') === 'true');
    const panels = [...list.closest('.code').querySelectorAll('[role="tabpanel"]')];
    return {
      role: list.getAttribute('role'),
      selected: active.map(tab => tab.id),
      focusable: tabs.filter(tab => tab.tabIndex === 0 && !tab.disabled).map(tab => tab.id),
      visible: panels.filter(panel => !panel.hidden && panel.getClientRects().length).map(panel => panel.id),
      labelled: panels.every(panel => panel.getAttribute('aria-labelledby') === panel.id.replace('panel-', 'tab-')),
      labelsHidden: [...list.closest('.code').querySelectorAll('[data-example-label]')].every(label => !label.getClientRects().length)
    };
  })()`);
  assert.deepEqual(state, {
    role: 'tablist',
    selected: ['tab-' + id],
    focusable: ['tab-' + id],
    visible: ['panel-' + id],
    labelled: true,
    labelsHidden: true,
  });
}

async function copy(browser, selector, expected) {
  // Observe the selection used by the real ClipboardJS copy event, without substituting its
  // implementation or relying on OS clipboard access in a headless browser.
  await browser.evaluate(`window.__docsCopiedText = null;
    document.addEventListener('copy', () => {
      window.__docsCopiedText = document.getSelection().toString();
    }, { once: true });`);
  await click(browser, selector);
  assert.equal(await browser.evaluate('window.__docsCopiedText'), expected, 'copied text');
  assert.deepEqual(
    await browser.evaluate(`({
    copied: document.querySelector(${JSON.stringify(selector)}).classList.contains('copied'),
    announced: document.getElementById('success-toast').getAttribute('aria-hidden'),
    error: document.getElementById('error-toast').dataset.visible
  })`),
    { copied: true, announced: 'false', error: 'false' }
  );
}

async function interactiveControls(browser, url, viewport) {
  await browser.evaluate(`localStorage.removeItem('fluent-measures:pm');
    localStorage.removeItem('fluent-measures:module');`);
  await browser.load(url, viewport);
  const examples = await examplesForPage(browser);
  const groups = [
    ['pm', ['npm', 'yarn', 'pnpm']],
    ['module', ['esm', 'cjs']],
    ['convert', ['convert-height', 'convert-weight']],
  ];
  for (const [group, ids] of groups) {
    await selected(browser, group, ids[0]);
    await browser.evaluate(`document.getElementById('tab-${ids[0]}').focus()`);
    for (const [key, id] of [
      ['ArrowRight', ids[1]],
      ['ArrowLeft', ids[0]],
      ['End', ids.at(-1)],
      ['ArrowRight', ids[0]],
      ['ArrowLeft', ids.at(-1)],
      ['Home', ids[0]],
    ]) {
      await press(browser, key);
      await selected(browser, group, id);
      assert.equal(await browser.evaluate('document.activeElement.id'), 'tab-' + id);
    }
  }
  assert.equal(
    await browser.evaluate(`[...document.querySelectorAll('.copy-button')]
    .filter(button => !button.disabled && button.getClientRects().length).length`),
    7
  );
  for (const id of ['npm', 'yarn', 'pnpm']) {
    await click(browser, '#tab-' + id);
    const command = examples.find(([key]) => key === id)[2];
    await copy(browser, '[data-copy="#hero-command"]', command);
    await copy(browser, '[aria-label="Copy install command"][data-copy=""]', command);
  }
  await click(browser, '#tab-cjs');
  await copy(
    browser,
    '[aria-label="Copy quick start"]',
    viewport.width < 640
      ? "const {\n  parseMeasurement,\n} = require(\n  '@afahy/fluent-measures',\n);\n\nconst result =\n  parseMeasurement('6 ft');\nif (result) {\n  console.log(result);\n}"
      : "const { parseMeasurement } = require('@afahy/fluent-measures');\n\nconst result = parseMeasurement('6 ft');\nif (result) {\n  console.log(result);\n}"
  );
  await click(browser, '#tab-convert-weight');
  await copy(
    browser,
    '[aria-label="Copy conversion example"]',
    viewport.width < 640
      ? "parseMeasurement('150 lbs', {\n  type: 'weight',\n  normalizedUnit: 'kg',\n});"
      : "parseMeasurement('150 lbs', { type: 'weight', normalizedUnit: 'kg' });"
  );
  // Both persisted choices and the synchronized hero command survive a new document load.
  await browser.load(url, viewport);
  await selected(browser, 'pm', 'pnpm');
  await selected(browser, 'module', 'cjs');
  await copy(browser, '[data-copy="#hero-command"]', examples.find(([id]) => id === 'pnpm')[2]);
}

export async function checkDocsControls(browser, url) {
  const problems = [];
  for (const scheme of ['light', 'dark']) {
    for (const [width, height] of [
      [390, 844],
      [1440, 900],
    ]) {
      const viewport = { width, height, scheme, scale: 1 };
      for (const mode of ['static', 'interactive', 'clipboard unavailable']) {
        try {
          await browser.send('Emulation.setScriptExecutionDisabled', { value: mode === 'static' });
          await browser.send('Network.enable');
          await browser.send('Network.setBlockedURLs', {
            urls: mode === 'clipboard unavailable' ? ['*clipboard.min.js*'] : [],
          });
          await browser.load(url, viewport);
          if (mode === 'static') {
            assert.deepEqual(
              await browser.evaluate(
                `(${staticControls})(${JSON.stringify(await examplesForPage(browser))})`
              ),
              []
            );
            const { nodes } = await browser.send('Accessibility.getFullAXTree');
            const exposed = nodes.filter(node => !node.ignored);
            assert.equal(
              exposed.some(node => ['tab', 'tablist', 'tabpanel'].includes(node.role?.value)),
              false
            );
            for (const [, label] of EXAMPLES) {
              assert.ok(
                exposed.some(node => node.role?.value === 'group' && node.name?.value === label),
                label
              );
            }
          } else if (mode === 'interactive') {
            await interactiveControls(browser, url, viewport);
          } else {
            assert.equal(
              await browser.evaluate(`[...document.querySelectorAll('.copy-button')]
              .filter(button => !button.disabled && button.getClientRects().length).length`),
              0
            );
            await click(browser, '#tab-yarn');
            await selected(browser, 'pm', 'yarn');
          }
        } catch (error) {
          problems.push({ problem: `CONTROLS ${mode}: ${error.message}`, scheme, width });
        } finally {
          await browser.send('Emulation.setScriptExecutionDisabled', { value: false });
          await browser.send('Network.setBlockedURLs', { urls: [] });
        }
      }
    }
  }
  await browser.evaluate(`localStorage.removeItem('fluent-measures:pm');
    localStorage.removeItem('fluent-measures:module');`);
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let browser;
  try {
    browser = await launchChrome(requireChrome());
    const problems = await checkDocsControls(
      browser,
      pageUrl(process.argv[2] ?? 'docs/index.html', process.cwd())
    );
    for (const { problem, scheme, width } of problems)
      console.error(`${scheme} ${width}: ${problem}`);
    if (problems.length) process.exitCode = 1;
    else console.log('Static and initialized controls pass at 390 and 1440px, in light and dark.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  } finally {
    await browser?.close();
  }
}
