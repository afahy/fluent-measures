import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { lighthouseFailures } from '../.github/scripts/docs-audit-check.mjs';

describe('the docs Lighthouse gate', () => {
  it('provides the audit command and engines used by CI', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(manifest.scripts['docs:audit']).toBe('node .github/scripts/docs-audit.mjs');
    expect(Object.keys(manifest.devDependencies)).toEqual(
      expect.arrayContaining(['lighthouse', 'axe-core'])
    );
  });

  const perfect = {
    categories: {
      performance: { score: 1 },
      accessibility: { score: 1 },
      'best-practices': { score: 1 },
      seo: { score: 1 },
    },
  };

  it('accepts four perfect scores', () => {
    expect(lighthouseFailures(perfect)).toEqual([]);
  });

  it.each(['performance', 'accessibility', 'best-practices', 'seo'])(
    'rejects a non-perfect %s score',
    category => {
      expect(
        lighthouseFailures({
          categories: { ...perfect.categories, [category]: { score: 0.99 } },
        })
      ).toEqual([`${category}: expected 100, got 99`]);
    }
  );

  it.each([undefined, null, {}, { categories: {} }])('rejects missing results: %j', report => {
    expect(lighthouseFailures(report)).toHaveLength(4);
  });

  it.each([null, undefined, NaN, 0, 1.01])('rejects invalid scores: %s', score => {
    expect(
      lighthouseFailures({ categories: { ...perfect.categories, seo: { score } } })
    ).toHaveLength(1);
  });

  it('rejects a runtime error even if a report contains perfect scores', () => {
    expect(
      lighthouseFailures({ ...perfect, runtimeError: { message: 'Navigation failed' } })
    ).toContain('Lighthouse: Navigation failed');
  });
});

// AFA-227: the live mobile baseline waited for cdnjs CSS and four synchronous scripts
// before painting (97 Performance). These optional enhancements must not block rendering.
describe('docs render-blocking resources', () => {
  const page = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');

  it('parses every inline script before any enhancement runs', () => {
    expect.hasAssertions();
    const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [, script] of scripts) expect(() => new Script(script)).not.toThrow();
  });

  it('loads its code styles without an external stylesheet', () => {
    const styles = page.match(/<link\b[^>]*rel="stylesheet"[^>]*>/g) ?? [];
    expect(styles.length).toBeGreaterThan(0);
    expect(styles.some(tag => /href="(?:https?:)?\/\//.test(tag))).toBe(false);
  });

  it('defers external scripts in document order', () => {
    expect.hasAssertions();
    const scripts = page.match(/<script\b[^>]*\bsrc="[^"]+"[^>]*>/g) ?? [];
    expect(scripts).toHaveLength(4);
    for (const script of scripts) {
      expect(script).toMatch(/\bdefer\b/);
      expect(script).not.toMatch(/\basync\b/);
    }
  });
});
