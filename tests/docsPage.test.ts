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
      String.raw`<script\b[^>]*\ssrc=${external}[^>]*>|<link\b(?=[^>]*\srel="stylesheet")[^>]*\shref=${external}[^>]*>`,
      'g'
    )
  ),
]
  .map(([tag, src, href]) => ({ tag, url: src ?? href }))
  // The Tailwind Play CDN sends no CORS header, so it can't take a hash (AFA-97).
  .filter(({ url }) => !url.startsWith('https://cdn.tailwindcss.com'));

describe('the docs page', () => {
  // Prism's stylesheet and three scripts, and clipboard.js, all from cdnjs.
  it('loads five external files that need a hash', () => {
    expect(tags).toHaveLength(5);
  });

  it.each(tags)('checks the integrity of $url', ({ tag }) => {
    expect(tag).toMatch(/\sintegrity="sha512-[A-Za-z0-9+/]{86}=="/);
    expect(tag).toMatch(/\scrossorigin="anonymous"/);
  });
});
