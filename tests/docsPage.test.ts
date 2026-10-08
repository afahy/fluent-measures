import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

// AFA-96: a file on another host can change, so each external script and stylesheet on the docs
// page carries an integrity hash. The browser checks the hash only for a CORS request, so each tag
// also needs crossorigin="anonymous". A URL that starts with "//" loads from another host too.
const page = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');

/**
 * The external scripts and stylesheets in an HTML page. Prettier checks the page, and it writes
 * each attribute value in double quotes with no spaces around "=". Names and "rel" values in HTML
 * ignore case, and "rel" can hold more than one value, as in rel="preload stylesheet".
 */
function externalTags(html: string): { tag: string; url: string }[] {
  const external = String.raw`"((?:https?:)?\/\/[^"]+)"`;
  const pattern = new RegExp(
    String.raw`<script\b[^>]*\ssrc=${external}[^>]*>|<link\b(?=[^>]*\srel="(?:[^"]*\s)?stylesheet[\s"])[^>]*\shref=${external}[^>]*>`,
    'gi'
  );
  return [...html.matchAll(pattern)].map(([tag, src, href]) => ({ tag, url: src ?? href }));
}

const tags = externalTags(page);

// AFA-102: the SHA-512 hash of each file, computed from the file on cdnjs with
// "curl -fsSL <url> | openssl dgst -sha512 -binary | openssl base64 -A". A new URL with an old
// hash then fails here, not only in the browser.
const HASHES: Record<string, string> = {
  'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css':
    'sha512-vswe+cgvic/XBoF1OcM/TeJ2FW0OofqAVdCZiEYkd6dwGXthvkSFWOoGGJgS2CW70VK5dQM5Oh+7ne47s74VTg==',
  'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js':
    'sha512-7Z9J3l1+EYfeaPKcGXu3MS/7T+w19WtKQY/n+xzmw4hZhJ9tyYmcUS+4QqAlzhicE5LAfMQSF3iFTK9bQdTxXg==',
  'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-typescript.min.js':
    'sha512-uOw7XYETzS/DPmmirpP5UCMihSDNMeyTS965J0/456OSPfxn9xEtHHjj5Q/5WefVdqyMfN/afmQnNpZd/tpkcA==',
  'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-bash.min.js':
    'sha512-whYhDwtTmlC/NpZlCr6PSsAaLOrfjVg/iXAnC4H/dtiHawpShhT2SlIMbpIhT/IL/NrpdMm+Hq2C13+VKpHTYw==',
  'https://cdnjs.cloudflare.com/ajax/libs/clipboard.js/2.0.11/clipboard.min.js':
    'sha512-7O5pXpc0oCRrxk8RUfDYFgn0nO1t+jLuIOQdOMRp4APB7uZ4vSjspzp5y6YDtDs4VzUSTbWzBFZ/LKJhnyFOKw==',
};

type Listener = (event?: unknown) => void;
type Toast = {
  dataset: Record<string, string>;
  attributes: Record<string, string>;
  setAttribute: (name: string, value: string) => void;
};
type Toasts = Record<'success-toast' | 'error-toast', Toast>;

/**
 * Run the page's copy-button script with stand-ins for the browser objects that it uses. The page
 * has one copy button here. The stand-ins act only on the event names and the selector that the
 * page should use. Return the button's click listeners and the two toasts.
 */
function runCopyScript(clipboardJS?: unknown): { clicks: Listener[]; toasts: Toasts } {
  const script = page
    .split('<script>')
    .map(part => part.split('</script>')[0])
    .find(code => code.includes('DOMContentLoaded'));
  expect(script, 'the copy-button script').toBeDefined();
  const toast = (): Toast => {
    const attributes: Record<string, string> = {};
    return {
      dataset: {},
      attributes,
      setAttribute: (name: string, value: string): void => {
        attributes[name] = value;
      },
    };
  };
  const toasts: Toasts = { 'success-toast': toast(), 'error-toast': toast() };
  const clicks: Listener[] = [];
  let onReady: Listener = () => undefined;
  const button = {
    addEventListener: (event: string, listener: Listener): void => {
      if (event === 'click') clicks.push(listener);
    },
  };
  const document = {
    addEventListener: (event: string, listener: Listener): void => {
      if (event === 'DOMContentLoaded') onReady = listener;
    },
    getElementById: (id: keyof Toasts): Toast => toasts[id],
    querySelectorAll: (selector: string): (typeof button)[] =>
      selector === '.copy-button' ? [button] : [],
  };
  const globals = { document, setTimeout: (): number => 0, clearTimeout: (): void => undefined };
  runInNewContext(script ?? '', clipboardJS ? { ...globals, ClipboardJS: clipboardJS } : globals);
  onReady();
  return { clicks, toasts };
}

describe('the docs page', () => {
  // Prism's stylesheet and three scripts, and clipboard.js, all from cdnjs.
  it('loads only the external files whose hashes the test knows', () => {
    expect(tags.map(({ url }) => url).sort()).toEqual(Object.keys(HASHES).sort());
  });

  it.each(tags)('checks the integrity of $url', ({ tag, url }) => {
    expect(Object.keys(HASHES)).toContain(url);
    // Attribute names, and the value of "crossorigin", ignore case in HTML. A hash doesn't.
    expect(/\sintegrity="([^"]*)"/i.exec(tag)?.[1]).toBe(HASHES[url]);
    expect(tag).toMatch(/\scrossorigin="anonymous"/i);
  });

  // AFA-102: the tags that the checks above find in other pages.
  it.each([
    ['<link href="https://a.example/x.css" rel="preload stylesheet" />', 'https://a.example/x.css'],
    ['<link rel="Stylesheet" href="https://a.example/x.css" />', 'https://a.example/x.css'],
    // The ticket's own example.
    [
      '<link rel="alternate stylesheet" href="https://a.example/x.css" />',
      'https://a.example/x.css',
    ],
    ['<SCRIPT src="//a.example/x.js"></SCRIPT>', '//a.example/x.js'],
    // AFA-97: the Tailwind Play CDN is no longer an exception.
    ['<script src="https://cdn.tailwindcss.com"></script>', 'https://cdn.tailwindcss.com'],
    ['<script src="http://cdn.tailwindcss.com"></script>', 'http://cdn.tailwindcss.com'],
    [
      '<script src="https://cdn.tailwindcss.com/3.4.0"></script>',
      'https://cdn.tailwindcss.com/3.4.0',
    ],
  ])('finds the external file in %s', (html, url) => {
    expect(externalTags(html).map(tag => tag.url)).toEqual([url]);
  });

  it.each([
    '<link rel="stylesheets" href="https://a.example/x.css" />',
    '<link rel="icon" href="https://a.example/x.png" />',
    '<script src="/local.js"></script>',
  ])('finds no external file to check in %s', html => {
    expect(externalTags(html)).toEqual([]);
  });

  // AFA-97: the page loads Tailwind's CSS from docs/tailwind.css, built from
  // docs/tailwind.config.cjs, so each class on the page needs a rule there.
  it('loads tailwind.css, which has a rule for each Tailwind class on the page', () => {
    expect(page).toContain('<link href="tailwind.css" rel="stylesheet" />');
    const css = readFileSync(new URL('../docs/tailwind.css', import.meta.url), 'utf8');
    const used = [
      ...[...page.matchAll(/\sclass="([^"]*)"/g)].flatMap(([, list]) => list.split(/\s+/)),
      ...[...page.matchAll(/classList\.\w+\(([^)]*)\)/g)].flatMap(([, list]) =>
        [...list.matchAll(/'([^']+)'/g)].map(([, name]) => name)
      ),
    ];
    // The page's script, Prism and the page's own <style> use these. "prose" needs Tailwind's
    // typography plugin, which the Play CDN didn't load either.
    const other = new Set(['', 'copied', 'copy-button', 'text-link', 'prose', 'prose-slate']);
    const missing = [...new Set(used)].filter(name => {
      if (other.has(name) || name.startsWith('language-')) return false;
      // Tailwind escapes a "," in a class name as "\2c " and each other symbol with a "\". The
      // name must end there, so "border-gray" doesn't match ".border-gray-200".
      const selector = `.${name.replace(/[^\w-]/g, symbol => (symbol === ',' ? '\\2c ' : `\\${symbol}`))}`;
      let at = css.indexOf(selector);
      while (at !== -1 && /[\w-]/.test(css[at + selector.length] ?? '')) {
        at = css.indexOf(selector, at + 1);
      }
      return at === -1;
    });
    expect(missing).toEqual([]);
  });

  // If the browser blocks clipboard.js, or cdnjs is down, "new ClipboardJS" would throw, and the
  // copy buttons would fail with no message.
  it('shows the error toast for a copy button when clipboard.js is missing', () => {
    const { clicks, toasts } = runCopyScript();
    expect(clicks).toHaveLength(1);
    clicks[0]();
    expect(toasts['error-toast'].dataset.visible).toBe('true');
    // A screen reader reads the toast only when it isn't hidden.
    expect(toasts['error-toast'].attributes['aria-hidden']).toBe('false');
    expect(toasts['success-toast'].dataset.visible).toBe('false');
  });

  it('uses clipboard.js for the copy buttons when it loaded', () => {
    const selectors: string[] = [];
    const handlers: Record<string, Listener> = {};
    function ClipboardJS(selector: string): { on: (event: string, handler: Listener) => void } {
      selectors.push(selector);
      return {
        on: (event: string, handler: Listener): void => {
          handlers[event] = handler;
        },
      };
    }
    const { clicks, toasts } = runCopyScript(ClipboardJS);
    expect(selectors).toEqual(['.copy-button']);
    expect(clicks).toEqual([]);
    expect(Object.keys(handlers).sort()).toEqual(['error', 'success']);

    // A copy marks its button and shows the success toast. A failed copy shows the error toast.
    const classes: string[] = [];
    let cleared = false;
    handlers.success({
      trigger: { classList: { add: (...names: string[]) => classes.push(...names) } },
      clearSelection: () => (cleared = true),
    });
    expect(classes).toContain('copied');
    expect(cleared).toBe(true);
    expect(toasts['success-toast'].dataset.visible).toBe('true');
    expect(toasts['success-toast'].attributes['aria-hidden']).toBe('false');
    handlers.error({});
    expect(toasts['error-toast'].dataset.visible).toBe('true');
    expect(toasts['success-toast'].dataset.visible).toBe('false');
  });
});
