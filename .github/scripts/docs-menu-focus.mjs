// AFA-219: a real keyboard traversal must not leave focus underneath the phone menu.
import { sleep } from './docs-chrome.mjs';

/** Runs after scrolling and layout settle. Sample the center and edges, inside rounded corners. */
function focusState() {
  const menu = document.querySelector('[data-page-menu]');
  const el = document.activeElement;
  const r = el.getBoundingClientRect();
  const points = [
    [r.left + r.width / 2, r.top + r.height / 2],
    [r.left + 1, r.top + r.height / 2],
    [r.right - 1, r.top + r.height / 2],
    [r.left + r.width / 2, r.top + 1],
    [r.left + r.width / 2, r.bottom - 1],
  ];
  return {
    open: menu.open,
    inside: menu.contains(el),
    summary: el === menu.querySelector('summary'),
    theme: el.matches('[data-theme-menu] > summary'),
    copy: el.matches('.hero button[aria-label="Copy install command"]'),
    visible:
      r.width > 0 &&
      r.height > 0 &&
      r.top >= 0 &&
      r.bottom <= innerHeight &&
      el.matches(':focus-visible') &&
      points.every(([x, y]) => el.contains(document.elementFromPoint(x, y))),
    scrimHidden: document.querySelector('[data-page-scrim]').hidden,
  };
}

/** Called by docs:sweep at the ticket's 390×844 viewport, in each theme. */
export async function checkMenuFocus(browser) {
  const problems = [];
  const ready = await browser.evaluate(`Boolean(
    document.querySelector('[data-page-menu] > summary') &&
    document.querySelector('[data-page-scrim]') &&
    document.querySelector('.hero button[aria-label="Copy install command"]'))`);
  if (!ready) return ['MENU-FOCUS missing phone menu, scrim, or Copy install command'];
  const press = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    const event = { key, code, windowsVirtualKeyCode, modifiers };
    await browser.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      ...event,
      text: key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined,
    });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
  };
  const tab = (back = false) => press('Tab', 'Tab', 9, back ? 8 : 0);
  const state = () => browser.evaluate(`(${focusState})()`);
  const settled = async () => {
    // Include native focus scrolling, smooth scrolling, and the asynchronous details toggle.
    await sleep(500);
    return state();
  };
  const open = async (key, code, keyCode) => {
    await browser.evaluate(`document.querySelector('[data-page-menu] > summary').focus()`);
    await press(key, code, keyCode);
    await sleep(60);
    return (await state()).open;
  };

  if (!(await open('Enter', 'Enter', 13))) {
    problems.push('MENU-FOCUS Enter did not open the phone menu');
  } else {
    let current;
    let visitedLink = false;
    let visitedTheme = false;
    // A bound catches a keyboard trap without hanging the sweep.
    for (let step = 0; step < 40; step++) {
      await tab();
      current = await state();
      if (current.inside && !current.summary) visitedLink = true;
      if (current.theme) visitedTheme = true;
      if (current.copy) break;
    }
    current = await settled();
    if (!visitedLink || !visitedTheme || !current.copy) {
      problems.push('MENU-FOCUS Tab did not traverse the menu and theme control to Copy');
    }
    if (!current.visible || current.open || !current.scrimHidden) {
      problems.push('MENU-FOCUS Tab to Copy leaves focus obscured or the overlay open');
    }
  }

  // Reset only the disclosure between independent forward and backward cases.
  await browser.evaluate(`document.querySelector('[data-page-menu]').open = false`);
  if (!(await open(' ', 'Space', 32))) {
    problems.push('MENU-FOCUS Space did not open the phone menu');
  } else {
    await tab();
    await tab(true);
    const inside = await state();
    if (!inside.summary || !inside.open) {
      problems.push('MENU-FOCUS Shift+Tab within the menu closed it or lost the summary');
    }
    await tab(true);
    const outside = await settled();
    if (outside.inside || outside.open || !outside.scrimHidden || !outside.visible) {
      problems.push('MENU-FOCUS Shift+Tab out leaves focus obscured or the overlay open');
    }
  }
  return problems;
}
