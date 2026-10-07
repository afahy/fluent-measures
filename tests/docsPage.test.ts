import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// AFA-96: a file on another host can change, so each external script and stylesheet on the docs
// page carries an integrity hash. The browser checks the hash only for a CORS request, so each tag
// also needs crossorigin="anonymous". A URL that starts with "//" loads from another host too.
const page = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const external = String.raw`"((?:https?:)?\/\/[^"]+)"`;
const tags = [
  ...page.matchAll(
    new RegExp(
      // "rel" can hold more than one value, as in rel="preload stylesheet".
      String.raw`<script\b[^>]*\ssrc=${external}[^>]*>|<link\b(?=[^>]*\srel="(?:[^"]*\s)?stylesheet[\s"])[^>]*\shref=${external}[^>]*>`,
      'g'
    )
  ),
]
  .map(([tag, src, href]) => ({ tag, url: src ?? href }))
  // The Tailwind Play CDN sends no CORS header, so it can't take a hash (AFA-97). Only this exact
  // URL is skipped, so another path or plain http on that host is still checked.
  .filter(({ url }) => url !== 'https://cdn.tailwindcss.com');

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

describe('the docs page', () => {
  // Prism's stylesheet and three scripts, and clipboard.js, all from cdnjs.
  it('loads five external files that need a hash', () => {
    expect(tags.map(({ url }) => url).sort()).toEqual(Object.keys(HASHES).sort());
  });

  it.each(tags)('checks the integrity of $url', ({ tag, url }) => {
    expect(/\sintegrity="([^"]*)"/.exec(tag)?.[1]).toBe(HASHES[url]);
    expect(tag).toMatch(/\scrossorigin="anonymous"/);
  });

  // If the browser blocks clipboard.js, or cdnjs is down, "new ClipboardJS" would throw, and the
  // copy buttons would fail with no message.
  it('checks that clipboard.js loaded before it uses it', () => {
    expect(page.indexOf("typeof ClipboardJS === 'undefined'")).toBeGreaterThan(-1);
    expect(page.indexOf("typeof ClipboardJS === 'undefined'")).toBeLessThan(
      page.indexOf('new ClipboardJS(')
    );
  });
});
