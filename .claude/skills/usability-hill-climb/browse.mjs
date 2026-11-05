// browse.mjs: the only way a usability reviewer looks at a page. Each call opens the page in the
// system Chrome, clicks, scrolls and screenshots it like a reader would, prints the text that is in
// the viewport, and appends one event to the reviewer's trace. The grader counts views, sections
// and off-page visits from the trace, so reviewers don't have to report their own wrong turns.
//
//   node browse.mjs --task T2 [--url <url>] [--at '#anchor' | --scroll <px> | --find '<text>' [--nth 2]]
//                   [--click '<visible text>']... [--note '<why>']
//
// Each call starts from a fresh load, as if the reader opened the link again. --click clicks the
// first button, tab, link or summary with that text, after --at when it is given, and it can be
// repeated. --find scrolls to the nth match of the text, like the browser's Find.
//
// Defaults come from the environment, which the run folder's env.sh sets:
//   PAGE_URL     the docs page under test (live URL or file:// of a worktree)
//   REPO         a checkout of fluent-measures that has .github/scripts/docs-chrome.mjs
//   TRACE        the JSONL trace file of this reviewer
//   SHOTS        the folder for screenshots
//   VIEW_WIDTH, VIEW_HEIGHT, VIEW_SCHEME   viewport, default 1440 x 900 light
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    task: { type: 'string' },
    url: { type: 'string' },
    at: { type: 'string' },
    scroll: { type: 'string' },
    find: { type: 'string' },
    nth: { type: 'string', default: '1' },
    click: { type: 'string', multiple: true, default: [] },
    note: { type: 'string', default: '' },
  },
});

const env = process.env;
const fail = message => {
  console.error(`browse.mjs: ${message}`);
  process.exit(2);
};
if (!/^[TH][0-9]+$/.test(values.task ?? ''))
  fail('give --task T1 ... T7, H1 or H2 (the task this view is for).');
for (const name of ['PAGE_URL', 'REPO', 'TRACE', 'SHOTS']) {
  if (!env[name]) fail(`${name} isn't set. Run "source env.sh" in your reviewer folder first.`);
}
const moves = ['at', 'scroll', 'find'].filter(name => values[name] !== undefined);
if (moves.length > 1) fail('use only one of --at, --scroll and --find.');

const { launchChrome, requireChrome } = await import(
  pathToFileURL(join(env.REPO, '.github/scripts/docs-chrome.mjs')).href
);

const width = Number(env.VIEW_WIDTH ?? 1440);
const height = Number(env.VIEW_HEIGHT ?? 900);
const scheme = env.VIEW_SCHEME ?? 'light';
const base = values.url ?? env.PAGE_URL;
const url = values.at && !values.url ? base.replace(/#.*$/, '') + values.at : base;

// Runs in the page. Returns what a reader sees in the viewport, in reading order.
const readViewport = `(() => {
  const vh = innerHeight;
  const visible = el => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (e.hidden || s.display === 'none' || s.visibility === 'hidden') return false;
      const parent = e.parentElement;
      if (parent?.tagName === 'DETAILS' && !parent.open && e.tagName !== 'SUMMARY') return false;
    }
    return true;
  };
  const blockOf = node => node.parentElement.closest('h1,h2,h3,h4,p,li,dt,dd,pre,td,th,figcaption,button,summary,a,label,div');
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const lines = [];
  const pinned = [];
  const pinnedOf = el => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const pos = getComputedStyle(e).position;
      if (pos === 'fixed' || pos === 'sticky') return true;
    }
    return false;
  };
  let last = null, line = '', lastPre = false;
  const flush = () => { if (line.trim()) lines.push(lastPre ? line.replace(/\\s+$/, '') : line.replace(/\\s+/g, ' ').trim()); line = ''; };
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const inPre = Boolean(n.parentElement.closest('pre'));
    if ((!inPre && !n.textContent.trim()) || !visible(n.parentElement)) continue;
    if (n.parentElement.closest('script,style,svg,template')) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const rects = [...range.getClientRects()];
    if (!rects.some(r => r.bottom > 0 && r.top < vh && r.width > 0)) continue;
    if (pinnedOf(n.parentElement)) { pinned.push(n.textContent.replace(/\\s+/g, ' ').trim()); continue; }
    const block = blockOf(n);
    const pre = inPre ? n.parentElement.closest('pre') : null;
    const blockKey = pre ?? block;
    if (blockKey !== last) flush();
    last = blockKey;
    lastPre = Boolean(pre);
    line += n.textContent;
  }
  flush();
  const headings = [...document.querySelectorAll('h1,h2,h3,h4')];
  const above = headings.filter(h => h.getBoundingClientRect().top < vh * 0.35 && visible(h));
  const current = above.at(-1) ?? headings[0];
  const section = current ? (current.id || current.closest('[id]')?.id || '') : '';
  const links = [...document.querySelectorAll('a[href]')]
    .filter(a => visible(a) && (r => r.bottom > 0 && r.top < vh)(a.getBoundingClientRect()))
    .map(a => (a.textContent.trim().replace(/\\s+/g, ' ') || a.getAttribute('aria-label') || '?') + ' -> ' + a.getAttribute('href'));
  return { lines, pinned: pinned.join(' | '), section, links, scrollY: Math.round(scrollY), pageHeight: document.documentElement.scrollHeight, href: location.href };
})()`;

const clickByText = (text, at) => `(() => {
  const want = ${JSON.stringify(text)}.trim().toLowerCase();
  const anchor = ${JSON.stringify(at ?? null)} && document.querySelector(${JSON.stringify(at ?? 'body')});
  const after = el => !anchor || Boolean(anchor.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  const all = [...document.querySelectorAll('button,a,[role=tab],summary,label')].filter(after);
  const norm = el => (el.textContent || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const el = all.find(e => norm(e) === want && e.getClientRects().length) ?? all.find(e => norm(e).includes(want) && e.getClientRects().length);
  if (!el) return false;
  el.scrollIntoView({ block: 'center' });
  el.click();
  return norm(el);
})()`;

const findText = (text, nth) => `(() => {
  const want = ${JSON.stringify(text)}.toLowerCase();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const hits = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement.closest('script,style,svg,template')) continue;
    if (n.textContent.toLowerCase().includes(want) && n.parentElement.getClientRects().length) hits.push(n.parentElement);
  }
  const target = hits[${nth} - 1];
  if (target) target.scrollIntoView({ block: 'center' });
  return { count: hits.length, found: Boolean(target) };
})()`;

const browser = await launchChrome(requireChrome());
let view;
let clicked = [];
let found = null;
try {
  await browser.load(url, { width, height, scheme, scale: 1 });
  // The page scrolls smoothly. Jump at once, so that the view is read where it ends.
  await browser.evaluate("document.documentElement.style.scrollBehavior = 'auto'; true");
  for (const text of values.click) {
    const result = await browser.evaluate(clickByText(text, values.at));
    clicked.push(result || `NOT FOUND: ${text}`);
    await new Promise(done => setTimeout(done, 250));
  }
  // The browser jumps to the anchor before the highlighter settles the layout, so jump again.
  if (values.at !== undefined) {
    await browser.evaluate(
      `document.querySelector(${JSON.stringify(values.at)})?.scrollIntoView({ block: 'start' })`
    );
  }
  if (values.scroll !== undefined) await browser.evaluate(`scrollTo(0, ${Number(values.scroll)})`);
  if (values.find !== undefined)
    found = await browser.evaluate(findText(values.find, Number(values.nth)));
  await new Promise(done => setTimeout(done, 300));
  view = await browser.evaluate(readViewport);
  mkdirSync(env.SHOTS, { recursive: true });
  const shot = join(env.SHOTS, `${Date.now()}-${values.task}.png`);
  const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(shot, Buffer.from(data, 'base64'));
  view.shot = shot;
} finally {
  await browser.close();
}

const onPage = view.href.startsWith(env.PAGE_URL.replace(/#.*$/, ''));
appendFileSync(
  env.TRACE,
  JSON.stringify({
    t: new Date().toISOString(),
    kind: 'view',
    task: values.task,
    url: view.href,
    onPage,
    section: onPage ? view.section : null,
    at: values.at ?? null,
    scroll: values.scroll ?? null,
    find: values.find ?? null,
    clicked,
    scrollY: view.scrollY,
    note: values.note,
  }) + '\n'
);

console.log(`URL: ${view.href}`);
console.log(
  `Section: ${view.section || '(none)'}  scrollY: ${view.scrollY} of ${view.pageHeight}px`
);
if (clicked.length) console.log(`Clicked: ${clicked.join(' | ')}`);
if (found)
  console.log(`Find "${values.find}": ${found.count} matches${found.found ? '' : ' (none shown)'}`);
console.log(`Screenshot: ${view.shot}`);
console.log(`Pinned on screen (sticky header and rails): ${view.pinned || '(none)'}`);
console.log('--- Visible text ---');
console.log(view.lines.join('\n'));
console.log('--- Visible links ---');
console.log(view.links.join('\n') || '(none)');
