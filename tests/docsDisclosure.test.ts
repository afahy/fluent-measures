import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const page = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const script = page.slice(page.indexOf('const demo ='), page.indexOf('// The hero box'));

/** Run the real handler with supplied viewport geometry, independent of the page's CSS. */
function disclosure(
  top = 200,
  bottom = top + 44,
  headerBottom = 55
): {
  click: () => void;
  demo: { dataset: { expanded: string } };
  label: { textContent: string };
  status: { textContent: string };
  attributes: Record<string, string>;
  scrollIntoView: ReturnType<typeof vi.fn>;
} {
  let click = (): void => undefined;
  const label = { textContent: 'Show all 8 examples' };
  const status = { textContent: '' };
  const attributes: Record<string, string> = { 'aria-expanded': 'false' };
  const scrollIntoView = vi.fn();
  const button = {
    addEventListener: (event: string, fn: () => void): void => {
      if (event !== 'click') throw new Error(`Unexpected event: ${event}`);
      click = fn;
    },
    setAttribute: (name: string, value: string): void => {
      attributes[name] = value;
    },
    querySelector: (): typeof label => label,
    getBoundingClientRect: (): { top: number; bottom: number } => ({ top, bottom }),
    scrollIntoView,
  };
  const demo = {
    dataset: { expanded: 'false' },
    querySelector: (selector: string): typeof button | typeof status => {
      if (selector === '[data-demo-more]') return button;
      if (selector === '[data-demo-status]') return status;
      throw new Error(`Unexpected selector: ${selector}`);
    },
  };
  runInNewContext(script, {
    innerHeight: 844,
    document: {
      querySelector: (
        selector: string
      ): typeof demo | { getBoundingClientRect: () => { bottom: number } } => {
        if (selector === '[data-demo]') return demo;
        if (selector === '.site-header') {
          return { getBoundingClientRect: () => ({ bottom: headerBottom }) };
        }
        throw new Error(`Unexpected selector: ${selector}`);
      },
    },
  });
  return { click: (): void => click(), demo, label, status, attributes, scrollIntoView };
}

describe('the hero examples disclosure', () => {
  it('keeps the disclosure in the footer beside Usage and describes where rows appear', () => {
    const footer = page.match(/<figcaption class="demo-foot"[\s\S]*?<\/figcaption>/)?.[0] ?? '';
    expect(footer).toContain('data-demo-more');
    expect(footer).toContain('href="#usage"');
    expect(footer).toContain('aria-expanded="false"');
    expect(footer).toContain('aria-controls="demo-list"');
    expect(page).toContain('id="demo-list"');
    expect(footer).toContain('aria-describedby="demo-help"');
    expect(footer).toMatch(/id="demo-help"\s*>\s*Additional examples appear above this button\./);
    expect(footer).toContain('role="status" data-demo-status');
  });

  it('announces append and collapse without scrolling on expansion', () => {
    const view = disclosure(-200);
    view.click();
    expect(view.demo.dataset.expanded).toBe('true');
    expect(view.attributes['aria-expanded']).toBe('true');
    expect(view.label.textContent).toBe('Show fewer examples');
    expect(view.status.textContent).toBe(
      'All 8 examples are shown above. The 4 additional examples start with 150 lbs.'
    );
    expect(view.scrollIntoView).not.toHaveBeenCalled();
    view.click();
    expect(view.demo.dataset.expanded).toBe('false');
    expect(view.attributes['aria-expanded']).toBe('false');
    expect(view.label.textContent).toBe('Show all 8 examples');
    expect(view.status.textContent).toBe('Showing the first 4 examples.');
    view.click();
    expect(view.attributes['aria-expanded']).toBe('true');
    expect(view.label.textContent).toBe('Show fewer examples');
  });

  // Revised C's reported failure was y=-197 after a phone collapse. Also cover a partly
  // obscured control, the desktop header, and the lower edge; scrolling must be immediate.
  it.each([
    [-197, -153, 55],
    [66, 110, 55],
    [75, 119, 64],
    [789, 833, 55],
  ])('brings an obscured collapse control into view at %s..%s', (top, bottom, header) => {
    const view = disclosure(top, bottom, header);
    view.click();
    view.click();
    expect(view.scrollIntoView).toHaveBeenCalledExactlyOnceWith({
      block: 'nearest',
      behavior: 'instant',
    });
  });

  it.each([
    [67, 111, 55],
    [76, 120, 64],
    [400, 444, 55],
    [788, 832, 55],
  ])('leaves an already visible collapse control at %s..%s', (top, bottom, header) => {
    const view = disclosure(top, bottom, header);
    view.click();
    view.click();
    expect(view.scrollIntoView).not.toHaveBeenCalled();
  });
});
