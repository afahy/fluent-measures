import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const script = page.slice(page.indexOf('const tocGroups ='), page.lastIndexOf('})();'));

type Listener = (event: { target?: Link }) => void;
type Heading = {
  id: string;
  position: number;
  getBoundingClientRect: () => { top: number };
  compareDocumentPosition: (other: { position: number }) => number;
};
type Navigation = {
  rail: Group[];
  menu: Group[];
  siteLinks: Link[];
  scroll: (id: string) => void;
  hashchange: (hash: string) => void;
  click: (href: string) => void;
  resize: () => void;
};

class Link {
  attributes: Record<string, string>;

  constructor(
    href: string,
    readonly group: Group | null = null,
    readonly siteNav = false
  ) {
    this.attributes = { href };
  }

  getAttribute(name: string): string | undefined {
    return this.attributes[name];
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
  }

  closest(selector: string): Link | Group | null {
    if (selector === '.toc-group') return this.group;
    if (selector === '[data-section-nav]') return this.siteNav ? this : null;
    if (selector === 'a[href^="#"]') return this;
    throw new Error(`Unexpected link selector: ${selector}`);
  }
}

class Group {
  dataset: Record<string, string> = {};
  links: Link[];
  button = new Link('');
  toggle: Listener = () => undefined;

  constructor(hrefs: string[]) {
    this.links = hrefs.map(href => new Link(href, this));
    this.button.setAttribute('aria-expanded', 'true');
  }

  querySelectorAll(selector: string): Link[] {
    if (selector === 'a') return this.links;
    throw new Error(`Unexpected group selector: ${selector}`);
  }

  querySelector(
    selector: string
  ): Link & { addEventListener: (name: string, fn: Listener) => void } {
    if (selector !== ':scope > .toc-row > .toc-toggle') {
      throw new Error(`Unexpected group selector: ${selector}`);
    }
    return Object.assign(this.button, {
      addEventListener: (name: string, fn: Listener): void => {
        if (name !== 'click') throw new Error(`Unexpected button event: ${name}`);
        this.toggle = fn;
      },
    });
  }
}

/**
 * Execute the actual navigation script with DOM/event stand-ins. The fixture deliberately uses
 * different descendant names/order from the page: folding must follow links, not example titles.
 * Heading positions are inputs to scroll events, never calculated with the navigation code.
 */
function navigation(hash = '', firstHeading?: string): Navigation {
  const destinations = [
    ['#install', '#quick-start'],
    ['#usage', '#usage-second', '#usage-first'],
    ['#api', '#api-child'],
    ['#units'],
  ];
  const rail = destinations.map(hrefs => new Group(hrefs));
  const menu = destinations.map(hrefs => new Group(hrefs));
  const items = [...rail, ...menu];
  const groups = items.filter(item => item.links.length > 1);
  const siteLinks = destinations.map(([href]) => new Link(href, null, true));
  const links = [...items.flatMap(item => item.links), ...siteLinks];
  const windowEvents: Record<string, Listener> = {};
  const documentEvents: Record<string, Listener> = {};
  let scrollY = 0;
  const headings: Heading[] = destinations.flat().map((href, index) => ({
    id: href.slice(1),
    position: 1000 + index * 1000,
    getBoundingClientRect(): { top: number } {
      return { top: this.position - scrollY };
    },
    compareDocumentPosition(other: { position: number }): number {
      return this.position < other.position ? 4 : 2;
    },
  }));
  const heading = (id: string): Heading | undefined => headings.find(item => item.id === id);
  if (firstHeading) scrollY = heading(firstHeading)!.position - 100;
  const location = { hash };
  const window = {
    innerHeight: 800,
    get scrollY(): number {
      return scrollY;
    },
    addEventListener: (name: string, fn: Listener): Listener => (windowEvents[name] = fn),
  };
  const document = {
    documentElement: { scrollHeight: 20000 },
    getElementById: heading,
    addEventListener: (name: string, fn: Listener): Listener => (documentEvents[name] = fn),
    querySelectorAll: (selector: string): (Group | Link)[] => {
      if (selector === '.toc-group') return groups;
      if (selector === '.toc a, [data-section-nav] a') return links;
      if (selector === '.toc > ul > li') return items;
      throw new Error(`Unexpected document selector: ${selector}`);
    },
    querySelector: (selector: string): { classList: { toggle: () => void } } | null => {
      if (selector === '.toc-col .toc') return null;
      if (selector === '.site-header') return { classList: { toggle: (): void => undefined } };
      throw new Error(`Unexpected document selector: ${selector}`);
    },
  };
  runInNewContext(script, {
    document,
    window,
    location,
    Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
    requestAnimationFrame: (fn: () => void) => fn(),
    updateOverflow: () => undefined,
  });
  return {
    rail,
    menu,
    siteLinks,
    scroll(id: string): void {
      scrollY = heading(id)!.position - 100;
      windowEvents.scroll({});
    },
    hashchange(value: string): void {
      location.hash = value;
      windowEvents.hashchange({});
    },
    click(href: string): void {
      documentEvents.click({ target: new Link(href) });
    },
    resize(): void {
      windowEvents.resize({});
    },
  };
}

const states = (groups: Group[]): string[][] =>
  groups.slice(0, 3).map(group => [group.dataset.open, group.button.attributes['aria-expanded']]);
const active = (groups: Group[]): Link[] =>
  groups.flatMap(group => group.links).filter(link => link.attributes['aria-current'] === 'true');

describe('stable docs navigation', () => {
  // The ticket's Usage → API → Usage failure, with both reader-selected open and closed groups.
  it.each(['rail', 'menu'] as const)(
    'preserves %s choices when scrolling between groups',
    surface => {
      const nav = navigation();
      const groups = nav[surface];
      groups[1].toggle({});
      groups[2].toggle({});
      nav.scroll('usage-first');
      expect(states(groups)).toEqual([
        ['false', 'false'],
        ['true', 'true'],
        ['true', 'true'],
      ]);
      groups[1].toggle({});
      nav.scroll('api-child');
      expect(states(groups)).toEqual([
        ['false', 'false'],
        ['false', 'false'],
        ['true', 'true'],
      ]);
      nav.scroll('usage-second');
      nav.resize();
      expect(states(groups)).toEqual([
        ['false', 'false'],
        ['false', 'false'],
        ['true', 'true'],
      ]);
      expect(active(groups).map(link => link.attributes.href)).toEqual(['#usage']);
      expect(
        nav.siteLinks
          .filter(link => link.attributes['aria-current'])
          .map(link => link.attributes.href)
      ).toEqual(['#usage']);
      groups[1].toggle({});
      expect(active(groups).map(link => link.attributes.href)).toEqual(['#usage-second']);
    }
  );

  it('starts collapsed even at a restored scroll position without a hash', () => {
    const nav = navigation('', 'usage-first');
    expect(states(nav.rail)).toEqual([
      ['false', 'false'],
      ['false', 'false'],
      ['false', 'false'],
    ]);
    expect(states(nav.menu)).toEqual([
      ['false', 'false'],
      ['false', 'false'],
      ['false', 'false'],
    ]);
    expect(active(nav.rail).map(link => link.attributes.href)).toEqual(['#usage']);
  });

  it('reveals a direct nested hash in both outlines, then respects a manual close', () => {
    const nav = navigation('#usage%2Dfirst', 'usage-first');
    expect(states(nav.rail)).toEqual([
      ['false', 'false'],
      ['true', 'true'],
      ['false', 'false'],
    ]);
    expect(states(nav.menu)).toEqual([
      ['false', 'false'],
      ['true', 'true'],
      ['false', 'false'],
    ]);
    expect(active(nav.rail).map(link => link.attributes.href)).toEqual(['#usage-first']);
    nav.rail[1].toggle({});
    nav.scroll('api-child');
    nav.scroll('usage-second');
    expect(nav.rail[1].dataset.open).toBe('false');
    expect(nav.menu[1].dataset.open).toBe('true');
  });

  it('reveals only the destination group on hash changes and repeated anchor clicks', () => {
    const nav = navigation();
    nav.rail[0].toggle({});
    nav.hashchange('#api-child');
    expect(states(nav.rail)).toEqual([
      ['true', 'true'],
      ['false', 'false'],
      ['true', 'true'],
    ]);
    nav.rail[2].toggle({});
    nav.click('#api-child');
    expect(nav.rail[2].dataset.open).toBe('true');
    nav.click('#usage');
    expect(states(nav.rail)).toEqual([
      ['true', 'true'],
      ['true', 'true'],
      ['true', 'true'],
    ]);
    nav.hashchange('#unknown-heading');
    expect(states(nav.rail)).toEqual([
      ['true', 'true'],
      ['true', 'true'],
      ['true', 'true'],
    ]);
  });
});
