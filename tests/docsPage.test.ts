import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// AFA-96: a file on a CDN can change, so each cdnjs script and stylesheet on the docs page carries
// an integrity hash. The browser checks the hash only for a CORS request, so each tag also needs
// crossorigin="anonymous". The Tailwind Play CDN sends no CORS header, so it can't (AFA-97).
const page = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const tags = [
  ...page.matchAll(
    /<(?:script|link)\b[^>]*\b(?:src|href)="https:\/\/cdnjs\.cloudflare\.com\/[^>]*>/g
  ),
].map(([tag]) => tag);

describe('the docs page', () => {
  // Prism's stylesheet and three scripts, and clipboard.js.
  it('loads five files from cdnjs', () => {
    expect(tags).toHaveLength(5);
  });

  it.each(tags)('checks the integrity of %s', tag => {
    expect(tag).toMatch(/\sintegrity="sha512-[A-Za-z0-9+/]{86}=="/);
    expect(tag).toMatch(/\scrossorigin="anonymous"/);
  });
});
