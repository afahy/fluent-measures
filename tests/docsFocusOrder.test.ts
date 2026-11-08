import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const script = page.slice(
  page.indexOf('function markOverflow('),
  page.indexOf('function updateOverflow(')
);

// AFA-229: expected focusability comes from the ticket's keyboard tasks, not current output.
type Snippet = {
  clientWidth: number;
  scrollWidth: number;
  clientHeight: number;
  scrollHeight: number;
  scrollLeft: number;
  tabIndex: number;
  closest: (selector: string) => object | null;
  classList: { toggle: () => void };
};

function snippet(panel = false): Snippet {
  return {
    clientWidth: 400,
    scrollWidth: 400,
    clientHeight: 100,
    scrollHeight: 100,
    scrollLeft: 0,
    tabIndex: 0,
    closest: (selector: string): object | null =>
      selector === '[role="tabpanel"]' && panel ? {} : null,
    classList: { toggle: (): void => undefined },
  };
}

function update(el: Snippet): void {
  runInNewContext(script + '\nmarkOverflow(el);', { el });
}

describe('docs keyboard focus order', () => {
  it('offers the contents shortcut immediately after Skip to content', () => {
    const start = page.slice(page.indexOf('<body>'), page.indexOf('<svg class="sprite"'));
    expect([...start.matchAll(/href="([^"]+)"/g)].map(match => match[1])).toEqual([
      '#main',
      '#page-navigation',
    ]);
    expect(start).toContain('Skip to page navigation');
    expect(page).toMatch(/<nav\b[^>]*id="page-navigation"[^>]*tabindex="-1"/);
  });

  // AFA-269: the ticket sets this order. The links that leave the page come first, and the
  // theme button stays last at every width.
  it('orders the header controls: version, GitHub, page menu, theme', () => {
    const actions = page.slice(
      page.indexOf('<div class="header-actions">'),
      page.indexOf('</header>')
    );
    const controls = [...actions.matchAll(/<(?:a|details|button)\b[^>]*class="([^"]*)"[^>]*>/g)]
      .map(match => match[1].split(/\s+/))
      .filter(list => !list.includes('toc-toggle') && !list.includes('menu-github'))
      .filter(list => !list.includes('menu-version'))
      .map(list => list.find(name => name !== 'icon-link'));
    expect(controls).toEqual(['version-pill', 'header-github', 'page-menu', 'theme-toggle']);
  });

  it('removes an ordinary example that fits from sequential focus', () => {
    const el = snippet();
    update(el);
    expect(el.tabIndex).toBe(-1);
  });

  it('preserves the content entry into a selected tab panel', () => {
    const el = snippet(true);
    el.tabIndex = -1;
    update(el);
    expect(el.tabIndex).toBe(0);
  });

  it.each(['scrollWidth', 'scrollHeight'] as const)(
    'keeps even one pixel of %s overflow keyboard accessible',
    dimension => {
      const el = snippet();
      el[dimension] += 1;
      el.tabIndex = -1;
      update(el);
      expect(el.tabIndex).toBe(0);
    }
  );

  it('keeps a scroller focusable at its right edge and removes the stop when it fits again', () => {
    const el = snippet();
    el.scrollWidth = 600;
    el.scrollLeft = 200;
    el.tabIndex = -1;
    update(el);
    expect(el.tabIndex).toBe(0);
    el.clientWidth = 600;
    el.scrollLeft = 0;
    update(el);
    expect(el.tabIndex).toBe(-1);
  });

  it('keeps all static code examples focusable when scripts are unavailable', () => {
    const blocks = [...page.matchAll(/<pre\b[^>]*>/g)].map(match => match[0]);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.filter(tag => !tag.includes('tabindex="0"'))).toEqual([]);
  });
});
