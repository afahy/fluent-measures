// pnpm docs:shot [page] [--width 390] [--height 844] [--scheme light|dark] [--full] [--out file]
//
// Takes a screenshot of the docs page at a device width, through the system Chrome (AFA-186).
// The page defaults to docs/index.html, and the file to docs-shots/<width>-<scheme>.png. A
// viewport screenshot is at twice the pixel density. With --full, it takes the whole page at
// the normal density.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  EXIT_ERROR,
  launchChrome,
  pageUrl,
  requireChrome,
  shotOptions,
  sleep,
} from './docs-chrome.mjs';

let options;
let url;
try {
  options = shotOptions(process.argv.slice(2));
  url = pageUrl(options.page, process.cwd());
} catch (error) {
  console.error(error.message);
  process.exit(EXIT_ERROR);
}

const { width, height, scheme, full, out } = options;
const chrome = requireChrome();
let browser;
try {
  browser = await launchChrome(chrome);
  await browser.load(url, { width, height, scheme, scale: full ? 1 : 2 });
  if (full) {
    const pageHeight = await browser.evaluate('document.documentElement.scrollHeight');
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: pageHeight,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    await sleep(800);
  }
  const { data } = await browser.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: full,
  });
  const path = resolve(out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(data, 'base64'));
  process.stdout.write(`${path}\n`);
} catch (error) {
  console.error(error.message);
  process.exitCode = EXIT_ERROR;
} finally {
  await browser?.close();
}
