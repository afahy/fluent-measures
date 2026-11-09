// Audit the actual docs files over HTTP, or the deployed site with --url. Reports retain every
// run, including failures and axe's manual-review items. Nothing suppresses a failing audit.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import axe from 'axe-core';
import lighthouse from 'lighthouse';
import desktop from 'lighthouse/core/config/desktop-config.js';
import { CATEGORIES, lighthouseFailures } from './docs-audit-check.mjs';
import { launchChrome, requireChrome } from './docs-chrome.mjs';
import { checkReadability } from './docs-readability.mjs';
import { buildDocs } from './docs-build.mjs';

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    directory: { type: 'string' },
    runs: { type: 'string', default: '3' },
    only: { type: 'string', default: 'all' },
  },
});
if (!/^[1-9]\d*$/.test(values.runs)) throw new Error('--runs must be a positive integer');
if (!['all', 'accessibility', 'lighthouse'].includes(values.only)) {
  throw new Error('--only must be all, accessibility or lighthouse');
}
if (values.url && values.directory) throw new Error('Use --url or --directory, not both');
const chrome = requireChrome();
const out = 'reports/docs-audit';
await mkdir(out, { recursive: true });
const problems = [];
const save = (name, data) => writeFile(`${out}/${name}.json`, JSON.stringify(data, null, 2));

// GitHub Pages compresses text. Match that locally rather than measuring an uncompressed
// development server. Audit the same artifact and project subpath as the Pages deployment.
const basePath = '/fluent-measures/';
const mime = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};
let server;
let url = values.url;
if (url && !/^https?:\/\//.test(url)) throw new Error('--url must use http or https');
if (!url) {
  const root = values.directory ? resolve(values.directory) : buildDocs();
  server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (!pathname.startsWith(basePath)) throw new Error('Outside project');
      const file = resolve(root, pathname.slice(basePath.length) || 'index.html');
      if (!file.startsWith(root + sep)) throw new Error('Outside docs');
      let data = await readFile(file);
      res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
      res.setHeader('Cache-Control', 'max-age=600');
      res.setHeader('Vary', 'Accept-Encoding');
      if (/\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
        data = gzipSync(data);
        res.setHeader('Content-Encoding', 'gzip');
      }
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', done);
  });
  url = `http://127.0.0.1:${server.address().port}${basePath}`;
}

async function accessibility() {
  const browser = await launchChrome(chrome);
  const reports = [];
  try {
    for (const scheme of ['light', 'dark']) {
      for (const width of [320, 390, 768, 1440]) {
        await browser.load(url, { width, height: 900, scale: 1, scheme });
        // A broken script/CDN must not earn a pass by hiding all the interactive controls.
        const ready = await browser.evaluate(`(() => ({
          main: !!document.querySelector('main h1'),
          tabs: document.querySelectorAll('[role="tablist"]').length,
          copy: !!document.querySelector('.copy-button:not([hidden]):not(:disabled)'),
          highlighted: !!document.querySelector('pre .token')
        }))()`);
        if (!ready.main || ready.tabs !== 3 || !ready.copy || !ready.highlighted) {
          problems.push(`${scheme} ${width}: docs did not initialize: ${JSON.stringify(ready)}`);
        }
        // The page remembers selected tabs. Reset each group so earlier viewports cannot
        // leave the first panel untested on later loads.
        await browser.evaluate(`document.querySelectorAll('[role="tablist"]').forEach(list => {
          list.querySelector('[role="tab"]').click();
        })`);
        await browser.evaluate(axe.source);
        const scan = async state => {
          const result = await browser.evaluate(`axe.run(document, {
            runOnly: { type: 'tag', values: [
              'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'
            ] }
          })`);
          reports.push({ scheme, width, state, result });
          for (const violation of result.violations) {
            problems.push(
              `${scheme} ${width} ${state}: ${violation.id}: ` +
                violation.nodes.map(node => node.target.join(' ')).join(', ')
            );
          }
          console.log(
            `axe ${scheme} ${width} ${state}: ${result.violations.length} violations; ` +
              `${result.incomplete.length} rules need manual review`
          );
        };
        await scan('initial');
        await browser.evaluate(`(() => {
          document.querySelector('[data-demo-more]').click();
          document.querySelectorAll('main details').forEach(el => { el.open = true; });
        })()`);
        await scan('expanded');
        // Visit every tab, including the middle package-manager choice. Selected content is
        // scanned while visible; hidden panels cannot pass merely because axe ignores them.
        for (const index of [1, 2]) {
          await browser.evaluate(`document.querySelectorAll('[role="tablist"]').forEach(list => {
            const tabs = list.querySelectorAll('[role="tab"]');
            tabs[Math.min(${index}, tabs.length - 1)].click();
          })`);
          await scan(`tabs-${index}`);
        }
        if (width < 1024) {
          await browser.evaluate(`document.querySelector('[data-page-menu]').open = true`);
          await scan('navigation');
        }
        await browser.load(url, { width, height: 900, scale: 1, scheme });
        for (const problem of await checkReadability(browser)) {
          problems.push(`${scheme} ${width} text spacing: ${problem}`);
        }
        // Script execution is disabled for the navigation, then re-enabled only to inject the
        // scanner. The page's own scripts were never executed on this load.
        await browser.send('Emulation.setScriptExecutionDisabled', { value: true });
        await browser.load(url, { width, height: 900, scale: 1, scheme });
        await browser.send('Emulation.setScriptExecutionDisabled', { value: false });
        await browser.evaluate(axe.source);
        await scan('no-script');
        for (const problem of await checkReadability(browser)) {
          problems.push(`${scheme} ${width} no-script text spacing: ${problem}`);
        }
      }
    }
  } finally {
    await save('accessibility', reports);
    await browser.close();
  }
}

async function scores() {
  for (const mode of ['mobile', 'desktop']) {
    for (let run = 1; run <= Number(values.runs); run++) {
      const browser = await launchChrome(chrome);
      try {
        const result = await lighthouse(
          url,
          {
            port: browser.port,
            onlyCategories: CATEGORIES,
            output: ['json', 'html'],
            logLevel: 'error',
          },
          mode === 'desktop' ? desktop : undefined
        );
        const name = `${mode}-${run}`;
        await save(name, result?.lhr ?? null);
        if (result) await writeFile(`${out}/${name}.html`, result.report[1]);
        const failures = lighthouseFailures(result?.lhr);
        problems.push(...failures.map(failure => `${name}: ${failure}`));
        console.log(
          `Lighthouse ${name}: ` +
            CATEGORIES.map(
              category => `${category} ${result?.lhr.categories[category]?.score * 100}`
            ).join(', ')
        );
      } finally {
        await browser.close();
      }
    }
  }
}

try {
  if (values.only !== 'lighthouse') await accessibility();
  if (values.only !== 'accessibility') await scores();
  await save('summary', { url, checks: values.only, runs: Number(values.runs), problems });
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exitCode = 1;
  else
    console.log(
      `Automated docs audits passed. Reports: ${out}/. Manual WCAG review is still required.`
    );
} finally {
  server?.closeAllConnections();
  if (server) await new Promise(done => server.close(done));
}
