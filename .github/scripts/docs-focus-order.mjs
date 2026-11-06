// AFA-229: use real Tab/Enter input to check shortcuts and useful code focus stops.
// Run independently with pnpm exec node .github/scripts/docs-focus-order.mjs [page].
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { launchChrome, pageUrl, requireChrome } from './docs-chrome.mjs';

async function press(browser, key) {
  for (const type of ['keyDown', 'keyUp']) {
    await browser.send('Input.dispatchKeyEvent', {
      type,
      key,
      code: key,
      windowsVirtualKeyCode: { Tab: 9, Enter: 13, ArrowRight: 39 }[key],
      text: type === 'keyDown' && key === 'Enter' ? '\r' : undefined,
    });
  }
}

async function frames(browser) {
  await browser.evaluate(
    'new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))'
  );
}

async function focused(browser, selector) {
  assert.equal(
    await browser.evaluate(`document.activeElement.matches(${JSON.stringify(selector)})`),
    true,
    'expected focus on ' + selector
  );
}

async function shortcut(browser, desktop) {
  await browser.evaluate('document.querySelector(\'.skip-link[href="#main"]\').focus()');
  await press(browser, 'Tab');
  if (desktop) {
    await focused(browser, '.skip-navigation');
    assert.equal(
      await browser.evaluate(`(() => {
      const box = document.activeElement.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight;
    })()`),
      true,
      'shortcut visible on focus'
    );
    await press(browser, 'Enter');
    await focused(browser, '#page-navigation');
    await press(browser, 'Tab');
    await focused(browser, '#page-navigation a[href="#install"]');
    await press(browser, 'Enter');
    await press(browser, 'Tab');
    await focused(browser, '.anchor[href="#install"]');
  } else {
    await focused(browser, '.brand');
    assert.equal(
      await browser.evaluate('document.querySelector(".skip-navigation")?.getClientRects().length'),
      0,
      'no shortcut to a hidden sidebar'
    );
  }
  // Both versions keep the original route past the header.
  await browser.evaluate('document.querySelector(\'.skip-link[href="#main"]\').focus()');
  await press(browser, 'Enter');
  await press(browser, 'Tab');
  assert.equal(
    await browser.evaluate('document.querySelector("main").contains(document.activeElement)'),
    true,
    'Skip to content'
  );
}

async function codeOrder(browser) {
  await browser.evaluate('document.querySelector(\'[aria-label="Copy type example"]\').focus()');
  await press(browser, 'Tab');
  await focused(browser, '.anchor[href="#ex-convert"]');
  // An active code panel still has a content entry after its copy action, also after switching.
  await browser.evaluate('document.getElementById("tab-npm").focus()');
  await press(browser, 'ArrowRight');
  await focused(browser, '#tab-yarn');
  await press(browser, 'Tab');
  await focused(browser, '[aria-label="Copy install command"][data-copy=""]');
  await press(browser, 'Tab');
  await focused(browser, '#panel-yarn pre');

  // Constrain an ordinary example, as a narrow container or enlarged text can do. Resizing
  // the element must restore keyboard scrolling without requiring a window resize event.
  await browser.evaluate(`window.__focusCode = [...document.querySelectorAll('[aria-labelledby="ex-type"] pre')]
    .find(el => el.getClientRects().length);
    window.__focusCode.style.width = '80px';
    window.__focusCode.style.height = '60px';`);
  await frames(browser);
  assert.deepEqual(
    await browser.evaluate(`({
    overflow: window.__focusCode.scrollWidth > window.__focusCode.clientWidth || window.__focusCode.scrollHeight > window.__focusCode.clientHeight,
    tabIndex: window.__focusCode.tabIndex
  })`),
    { overflow: true, tabIndex: 0 }
  );
  await browser.evaluate('document.querySelector(\'[aria-label="Copy type example"]\').focus()');
  await press(browser, 'Tab');
  assert.equal(
    await browser.evaluate('document.activeElement === window.__focusCode'),
    true,
    'overflowing example reached by Tab'
  );
  await browser.evaluate(
    'window.__focusCode.style.width = ""; window.__focusCode.style.height = "";'
  );
  await frames(browser);
  assert.equal(
    await browser.evaluate('window.__focusCode.tabIndex'),
    -1,
    'fitting example leaves Tab order'
  );

  await browser.evaluate(
    'document.querySelector(".full-object").open = false; document.querySelector(".full-object summary").focus()'
  );
  await press(browser, 'Enter');
  await frames(browser);
  assert.equal(
    await browser.evaluate('document.querySelector(".full-object").open'),
    true,
    'Enter opens the full-result disclosure'
  );
  await press(browser, 'Tab');
  await focused(browser, '.anchor[href="#usage"]');
}

export async function checkFocusOrder(browser, url) {
  const problems = [];
  for (const scheme of ['light', 'dark']) {
    for (const width of [390, 1440]) {
      for (const scripted of [true, false]) {
        try {
          await browser.send('Emulation.setScriptExecutionDisabled', { value: !scripted });
          await browser.load(url, { width, height: 900, scale: 1, scheme });
          await shortcut(browser, width >= 1024);
          if (scripted) await codeOrder(browser);
          else
            assert.equal(
              await browser.evaluate(
                `[...document.querySelectorAll('.code pre')].every(el => el.tabIndex === 0)`
              ),
              true,
              'static code remains keyboard accessible'
            );
        } catch (error) {
          problems.push({
            problem: `FOCUS ORDER [scripts=${scripted}]: ${error.message}`,
            scheme,
            width,
          });
        } finally {
          await browser.send('Emulation.setScriptExecutionDisabled', { value: false });
        }
      }
    }
  }
  // Do not carry this check's package-manager choice into the other sweep checks.
  await browser.evaluate("localStorage.removeItem('fluent-measures:pm')");
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const browser = await launchChrome(requireChrome());
  try {
    const problems = await checkFocusOrder(
      browser,
      pageUrl(process.argv[2] ?? 'docs/index.html', process.cwd())
    );
    assert.deepEqual(problems, []);
    console.log(
      'Docs focus order passes at 390 and 1440px, with and without scripts, in both themes.'
    );
  } finally {
    await browser.close();
  }
}
