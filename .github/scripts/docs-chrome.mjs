// Helpers for the docs page scripts, docs-shot.mjs and docs-sweep.mjs (AFA-186). They drive the
// system Chrome through the DevTools protocol, so they need no dependency. Device emulation sets
// the viewport width. Headless Chrome's --window-size can't go below about 500px, so phone widths
// need emulation.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const DEFAULT_PAGE = 'docs/index.html';

/** Exit code for a usage error or a browser that fails. A sweep that finds problems exits 1. */
export const EXIT_ERROR = 2;

/**
 * The path of the Chrome binary. `CHROME_PATH` wins. Then the usual install paths for the
 * platform, and on Linux the usual names on `PATH`. Returns null when none exists.
 */
export function findChrome(env, platform, exists = existsSync) {
  if (env.CHROME_PATH) return env.CHROME_PATH;
  const candidates = [];
  if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    );
  } else if (platform === 'win32') {
    for (const root of [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA]) {
      if (root) candidates.push(join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    }
  } else {
    const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
    for (const dir of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
      for (const name of names) candidates.push(join(dir, name));
    }
  }
  return candidates.find(path => exists(path)) ?? null;
}

/**
 * The URL to load. A `file:`, `http:` or `https:` URL stays as it is. Anything else is a path
 * from `cwd`, and it must be a file.
 */
export function pageUrl(page, cwd, isFile = path => existsSync(path) && statSync(path).isFile()) {
  if (/^(?:file|https?):/i.test(page)) return page;
  const path = resolve(cwd, page);
  if (!isFile(path)) throw new Error(`No page at ${path}`);
  return pathToFileURL(path).href;
}

/** A whole number from an option, or an error that names the option. */
function wholeNumber(value, name, min) {
  if (!/^\d+$/.test(value) || +value < min) {
    throw new Error(`--${name} must be a whole number of at least ${min}, not "${value}"`);
  }
  return +value;
}

function onePage(positionals) {
  if (positionals.length > 1) throw new Error(`Give one page, not ${positionals.length}`);
  return positionals[0] ?? DEFAULT_PAGE;
}

/** The options of docs-shot.mjs. Throws on an option that it doesn't know or a bad value. */
export function shotOptions(args) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      width: { type: 'string', default: '390' },
      height: { type: 'string', default: '844' },
      scheme: { type: 'string', default: 'light' },
      full: { type: 'boolean', default: false },
      out: { type: 'string' },
    },
  });
  if (values.scheme !== 'light' && values.scheme !== 'dark') {
    throw new Error(`--scheme must be light or dark, not "${values.scheme}"`);
  }
  const width = wholeNumber(values.width, 'width', 1);
  const height = wholeNumber(values.height, 'height', 1);
  const name = `${width}-${values.scheme}${values.full ? '-full' : ''}.png`;
  return {
    page: onePage(positionals),
    width,
    height,
    scheme: values.scheme,
    full: values.full,
    out: values.out ?? join('docs-shots', name),
  };
}

/** The options of docs-sweep.mjs. Throws on an option that it doesn't know or a bad value. */
export function sweepOptions(args) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      from: { type: 'string', default: '320' },
      to: { type: 'string', default: '1600' },
      step: { type: 'string', default: '10' },
      touch: { type: 'boolean', default: false },
    },
  });
  const from = wholeNumber(values.from, 'from', 1);
  const to = wholeNumber(values.to, 'to', 1);
  const step = wholeNumber(values.step, 'step', 1);
  if (to < from) throw new Error(`--to (${to}) must not be less than --from (${from})`);
  return { page: onePage(positionals), from, to, step, touch: values.touch };
}

/** The widths that a sweep visits, from `from` up to `to`, `step` apart. */
export function sweepWidths(from, to, step) {
  const widths = [];
  for (let width = from; width <= to; width += step) widths.push(width);
  return widths;
}

/**
 * Where one problem appears, with runs of widths joined: `light 320-340, 400; dark 320`. Each
 * place is `{ scheme, width }`, in the order that the sweep visited them.
 */
export function formatPlaces(places, step) {
  const runs = [];
  for (const { scheme, width } of places) {
    const last = runs.at(-1);
    if (last && last.scheme === scheme && width === last.to + step) last.to = width;
    else runs.push({ scheme, from: width, to: width });
  }
  const byScheme = new Map();
  for (const { scheme, from, to } of runs) {
    const list = byScheme.get(scheme) ?? [];
    list.push(from === to ? `${from}` : `${from}-${to}`);
    byScheme.set(scheme, list);
  }
  return [...byScheme].map(([scheme, list]) => `${scheme} ${list.join(', ')}`).join('; ');
}

const sleep = ms => new Promise(done => setTimeout(done, ms));

/** `promise`, or an error with `message` after `ms`. The timer stops when the promise settles. */
function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, fail) => {
    timer = setTimeout(() => fail(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Starts headless Chrome with a new profile and connects to its page. Returns `send` for a
 * DevTools command, `evaluate` for an expression in the page, `load` to open a URL and `close`,
 * which stops Chrome and removes the profile.
 */
export async function launchChrome(chrome) {
  const profile = mkdtempSync(join(tmpdir(), 'fm-docs-chrome-'));
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  const exited = new Promise(done => proc.once('exit', done));
  const close = async () => {
    if (proc.exitCode === null && proc.signalCode === null) {
      proc.kill();
      await Promise.race([exited, sleep(5000)]);
    }
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    } catch (error) {
      // A Chrome helper can still hold a file. A profile left in the temp folder isn't a reason
      // to fail the run.
      console.warn(`Could not remove ${profile}: ${error.message}`);
    }
  };
  try {
    const started = new Promise((done, fail) => {
      let output = '';
      proc.once('error', error => fail(new Error(`Could not start Chrome: ${error.message}`)));
      proc.once('exit', code => fail(new Error(`Chrome exited with code ${code}\n${output}`)));
      // Keep reading stderr after the URL, so that Chrome never blocks on a full pipe. The URL
      // counts only once its line ends, so a URL split across two chunks is read whole.
      proc.stderr.on('data', chunk => {
        if (output === null) return;
        output += chunk;
        const match = output.match(/(ws:\/\/\S+)\r?\n/);
        if (match) {
          output = null;
          done(match[1]);
        }
      });
    });
    const browserUrl = await withTimeout(started, 30000, 'Chrome did not start in 30 seconds');
    const { port } = new URL(browserUrl);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const target = targets.find(t => t.type === 'page');
    if (!target) throw new Error('Chrome has no page to drive');
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((done, fail) => {
      socket.addEventListener('open', done, { once: true });
      socket.addEventListener('error', () => fail(new Error('Could not connect to Chrome')), {
        once: true,
      });
    });
    let lastId = 0;
    const pending = new Map();
    const listeners = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      } else if (message.method) {
        for (const listener of listeners.get(message.method) ?? []) listener(message.params);
        listeners.delete(message.method);
      }
    });
    // If Chrome stops, each command that waits for an answer fails, so the script doesn't hang.
    let closed = false;
    socket.addEventListener('close', () => {
      closed = true;
      for (const answer of pending.values()) answer({ error: { message: 'Chrome closed' } });
      pending.clear();
    });
    const send = (method, params = {}) =>
      new Promise((done, fail) => {
        if (closed) return fail(new Error(`${method}: Chrome closed`));
        const id = ++lastId;
        pending.set(id, message =>
          message.error
            ? fail(new Error(`${method}: ${message.error.message}`))
            : done(message.result)
        );
        socket.send(JSON.stringify({ id, method, params }));
      });
    const nextEvent = method =>
      new Promise(done => listeners.set(method, [...(listeners.get(method) ?? []), done]));
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails) {
        const { exception, text } = result.exceptionDetails;
        throw new Error(`Error in the page: ${exception?.description ?? text}`);
      }
      return result.result.value;
    };
    /** Sets the viewport and the color scheme, opens `url` and waits for its load and fonts. */
    const load = async (url, { width, height, scale, scheme, touch = false }) => {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: scale,
        mobile: width < 600,
      });
      await send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: scheme }],
      });
      if (touch)
        await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await send('Page.enable');
      const loaded = nextEvent('Page.loadEventFired');
      const { errorText } = await send('Page.navigate', { url });
      if (errorText) throw new Error(`Could not load ${url}: ${errorText}`);
      await withTimeout(loaded, 30000, `${url} did not load in 30 seconds`);
      await evaluate('document.fonts.ready.then(() => true)');
      // Scripts on the page, such as the code highlighter, can still change the layout.
      await sleep(500);
    };
    return {
      send,
      evaluate,
      load,
      close: async () => {
        socket.close();
        await close();
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}

/** Finds Chrome, or prints how to set CHROME_PATH and exits. */
export function requireChrome() {
  const chrome = findChrome(process.env, process.platform);
  if (chrome) return chrome;
  console.error('Chrome was not found. Set CHROME_PATH to the Chrome or Chromium binary.');
  process.exit(EXIT_ERROR);
}

export { sleep };
