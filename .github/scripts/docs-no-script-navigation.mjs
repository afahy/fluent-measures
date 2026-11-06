// AFA-220: native navigation must leave its destination readable with scripts disabled.
// Run by docs:sweep, using the same Chrome connection and the actual keyboard/pointer events.
import { sleep } from './docs-chrome.mjs';

async function press(browser, key, code, windowsVirtualKeyCode) {
  const event = { key, code, windowsVirtualKeyCode };
  await browser.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event });
  if (key === 'Enter') {
    await browser.send('Input.dispatchKeyEvent', { type: 'char', text: '\r', ...event });
  }
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
}

/** Wait for native smooth scrolling to stop before measuring a destination or clicking. */
async function settled(browser) {
  let last;
  let stable = 0;
  for (let i = 0; i < 50; i++) {
    await sleep(100);
    const position = await browser.evaluate('scrollY');
    stable = position === last ? stable + 1 : 0;
    if (stable === 3) return;
    last = position;
  }
  throw new Error('Scrolling did not settle');
}

/** Real Tab traversal verifies that the link/disclosure is reachable without scripting. */
async function activate(browser, selector, input) {
  const quoted = JSON.stringify(selector);
  if (input === 'keyboard') {
    for (let i = 0; i < 300; i++) {
      if (await browser.evaluate(`document.activeElement.matches(${quoted})`)) {
        await press(browser, 'Enter', 'Enter', 13);
        return;
      }
      await press(browser, 'Tab', 'Tab', 9);
    }
    throw new Error(`Cannot reach ${selector} with Tab`);
  }
  const point = await browser.evaluate(`(() => {
    const el = document.querySelector(${quoted});
    if (!el) throw new Error('Missing ' + ${quoted});
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (!r.width || !r.height || !el.contains(document.elementFromPoint(x, y))) {
      throw new Error('Cannot click ' + ${quoted});
    }
    return { x, y };
  })()`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await browser.send('Input.dispatchMouseEvent', {
      type,
      ...point,
      button: 'left',
      clickCount: 1,
    });
  }
}

/** Runs in the page after navigation. Hit-testing catches an overlay even with the right hash. */
function destinationProblem(id) {
  const target = document.getElementById(id);
  if (location.hash !== '#' + id) return `Expected #${id}, got ${location.hash}`;
  if (!target) return `Missing #${id}`;
  const r = target.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  if (!r.width || !r.height || r.top < 0 || r.bottom > innerHeight || !target.contains(hit)) {
    return `#${id} is obscured at y=${r.top.toFixed(2)}..${r.bottom.toFixed(2)}; hit ${hit?.tagName} ${hit?.getAttribute('href') ?? ''}`;
  }
  return null;
}

export async function noScriptNavigation(browser, url) {
  const problems = [];
  // Do this BEFORE loading: removing data-js after load would leave event handlers installed.
  await browser.send('Emulation.setScriptExecutionDisabled', { value: true });
  try {
    for (const scheme of ['light', 'dark']) {
      for (const [width, height] of [
        [390, 844],
        [1440, 900],
      ]) {
        for (const input of ['keyboard', 'pointer']) {
          // API is the reported failure; a lower section and a nested topic cover both outlines.
          for (const id of ['api', 'troubleshooting', 'parse-options']) {
            try {
              await browser.load(url, { width, height, scale: 1, scheme });
              if (await browser.evaluate("document.documentElement.hasAttribute('data-js')")) {
                throw new Error('Page scripts ran');
              }
              if (width < 1024) {
                await activate(browser, '.page-menu > summary', input);
                if (!(await browser.evaluate("document.querySelector('.page-menu').open"))) {
                  throw new Error('Native navigation did not open');
                }
              }
              const nav =
                width < 1024 ? '.page-menu' : id === 'parse-options' ? '.toc-col' : '.site-nav';
              await activate(browser, `${nav} a[href="#${id}"]`, input);
              await settled(browser);
              const problem = await browser.evaluate(
                `(${destinationProblem})(${JSON.stringify(id)})`
              );
              if (problem) throw new Error(problem);
            } catch (error) {
              problems.push({ problem: `NO-SCRIPT ${input} ${error.message}`, scheme, width });
            }
          }
        }
      }
    }
  } finally {
    await browser.send('Emulation.setScriptExecutionDisabled', { value: false });
  }
  return problems;
}
