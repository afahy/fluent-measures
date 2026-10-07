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
  return (
    [...html.matchAll(pattern)]
      .map(([tag, src, href]) => ({ tag, url: src ?? href }))
      // The Tailwind Play CDN sends no CORS header, so it can't take a hash (AFA-97). Only this
      // exact URL is skipped, so another path or plain http on that host is still checked.
      .filter(({ url }) => url !== 'https://cdn.tailwindcss.com')
  );
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

type Listener = () => void;
type Toast = { dataset: Record<string, string>; setAttribute: () => void };

/**
 * Run the page's copy-button script with stand-ins for the browser objects that it uses. The page
 * has one copy button here. Return its click listeners and the two toasts.
 */
function runCopyScript(clipboardJS?: unknown): {
  clicks: Listener[];
  toasts: Record<string, { dataset: Record<string, string> }>;
} {
  const script = page
    .split('<script>')
    .map(part => part.split('</script>')[0])
    .find(code => code.includes('DOMContentLoaded'));
  const toast = (): Toast => ({
    dataset: {},
    setAttribute: () => undefined,
  });
  const toasts = { 'success-toast': toast(), 'error-toast': toast() };
  const clicks: Listener[] = [];
  let onReady: Listener = () => undefined;
  const button = {
    addEventListener: (_: string, listener: Listener): void => {
      clicks.push(listener);
    },
  };
  const document = {
    addEventListener: (_: string, listener: Listener): void => {
      onReady = listener;
    },
    getElementById: (id: keyof typeof toasts): Toast => toasts[id],
    querySelectorAll: (): (typeof button)[] => [button],
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
    expect(/\sintegrity="([^"]*)"/.exec(tag)?.[1]).toBe(HASHES[url]);
    expect(tag).toMatch(/\scrossorigin="anonymous"/);
  });

  // AFA-102: the tags that the checks above find in other pages.
  it.each([
    ['<link href="https://a.example/x.css" rel="preload stylesheet" />', 'https://a.example/x.css'],
    ['<link rel="Stylesheet" href="https://a.example/x.css" />', 'https://a.example/x.css'],
    ['<SCRIPT src="//a.example/x.js"></SCRIPT>', '//a.example/x.js'],
    ['<script src="http://cdn.tailwindcss.com"></script>', 'http://cdn.tailwindcss.com'],
    [
      '<script src="https://cdn.tailwindcss.com/3.4.0"></script>',
      'https://cdn.tailwindcss.com/3.4.0',
    ],
  ])('finds the external file in %s', (html, url) => {
    expect(externalTags(html).map(tag => tag.url)).toEqual([url]);
  });

  it.each([
    '<script src="https://cdn.tailwindcss.com"></script>',
    '<link rel="stylesheets" href="https://a.example/x.css" />',
    '<link rel="icon" href="https://a.example/x.png" />',
    '<script src="/local.js"></script>',
  ])('finds no external file to check in %s', html => {
    expect(externalTags(html)).toEqual([]);
  });

  // If the browser blocks clipboard.js, or cdnjs is down, "new ClipboardJS" would throw, and the
  // copy buttons would fail with no message.
  it('shows the error toast for a copy button when clipboard.js is missing', () => {
    const { clicks, toasts } = runCopyScript();
    expect(clicks).toHaveLength(1);
    clicks[0]();
    expect(toasts['error-toast'].dataset.visible).toBe('true');
    expect(toasts['success-toast'].dataset.visible).toBe('false');
  });

  it('uses clipboard.js for the copy buttons when it loaded', () => {
    const selectors: string[] = [];
    function ClipboardJS(selector: string): { on: () => void } {
      selectors.push(selector);
      return { on: () => undefined };
    }
    const { clicks } = runCopyScript(ClipboardJS);
    expect(selectors).toEqual(['.copy-button']);
    expect(clicks).toEqual([]);
  });
});
