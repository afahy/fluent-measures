// Browser regression for AFA-222, run by docs:sweep. Synthetic key events don't move focus;
// use Chrome's keyboard input and inspect the settled geometry and hit target instead.

/** Runs in the page after a focus change, including any browser-initiated smooth scrolling. */
async function settleScroll() {
  let last = scrollY;
  let stable = 0;
  const started = performance.now();
  while (performance.now() - started < 2000) {
    await new Promise(requestAnimationFrame);
    stable = scrollY === last ? stable + 1 : 0;
    last = scrollY;
    if (stable >= 4 && performance.now() - started >= 100) return;
  }
  throw new Error('Keyboard scrolling did not settle');
}

/** Runs in the page. Put the target under the header, next to the current tab stop. */
async function prepareFocus(selector, backward) {
  const target = document.querySelector(selector);
  const stops = [
    ...document.querySelectorAll('a[href], button, summary, input, [tabindex]'),
  ].filter(
    el =>
      el.tabIndex >= 0 && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'
  );
  const index = stops.indexOf(target);
  const adjacent = stops[index + (backward ? 1 : -1)];
  if (index < 0 || !adjacent) throw new Error('Missing tab stop for ' + selector);
  adjacent.focus({ preventScroll: true });
  // Let any focus handler finish before setting up the ticket's y≈16 failure position.
  await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
  scrollTo({ top: scrollY + target.getBoundingClientRect().top - 16, behavior: 'instant' });
  return target.getBoundingClientRect().top;
}

/** Runs in the page. Check the indicator as well as the target, not just :focus-visible. */
function inspectFocus(selector) {
  const el = document.querySelector(selector);
  const rect = el.getBoundingClientRect();
  const header = document.querySelector('.site-header').getBoundingClientRect();
  const style = getComputedStyle(el);
  const outline = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
  const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
  return {
    focused: document.activeElement === el,
    visible:
      el.matches(':focus-visible') &&
      style.outlineStyle !== 'none' &&
      parseFloat(style.outlineWidth) > 0,
    clear: rect.top - outline >= header.bottom && rect.bottom + outline <= innerHeight,
    hit: el === hit || el.contains(hit),
    top: Math.round(rect.top),
    headerBottom: header.bottom,
  };
}

export async function checkFocus(browser, scheme) {
  const problems = [];
  const targets = [
    '#option-type a.name',
    '#option-fuzziness a.name',
    '#tab-npm',
    '[aria-label="Copy quick start"]',
    '.full-object > summary',
  ];
  for (const motion of ['no-preference', 'reduce']) {
    await browser.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: scheme },
        { name: 'prefers-reduced-motion', value: motion },
      ],
    });
    for (const selector of targets) {
      for (const backward of [true, false]) {
        const label = `FOCUS ${backward ? 'Shift+Tab' : 'Tab'} ${selector} [motion=${motion}]`;
        const top = await browser.evaluate(
          `(${prepareFocus})(${JSON.stringify(selector)}, ${backward})`
        );
        if (Math.abs(top - 16) > 1) throw new Error(label + ': could not set up occlusion');
        for (const type of ['keyDown', 'keyUp']) {
          await browser.send('Input.dispatchKeyEvent', {
            type,
            key: 'Tab',
            code: 'Tab',
            windowsVirtualKeyCode: 9,
            modifiers: backward ? 8 : 0,
          });
        }
        await browser.evaluate(`(${settleScroll})()`);
        const result = await browser.evaluate(`(${inspectFocus})(${JSON.stringify(selector)})`);
        if (!result.focused || !result.visible || !result.clear || !result.hit) {
          problems.push(label + ' ' + JSON.stringify(result));
        }
      }
    }
  }
  await browser.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: scheme }],
  });
  await browser.evaluate(
    "document.activeElement.blur(); scrollTo({ top: 0, behavior: 'instant' })"
  );
  return problems;
}
