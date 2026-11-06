import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const page = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const script = page.slice(page.indexOf('const menus ='), page.indexOf('// The panel only exists'));
type Target = { closest: (selector: string) => Target | null };
type Event = { relatedTarget?: Target | null; target?: Target; key?: string };

function headerMenus(): {
  menus: ReturnType<typeof menu>[];
  scrim: { hidden: boolean };
  events: Record<string, (event: Event) => void>;
} {
  function menu(): {
    open: boolean;
    summary: { focus: ReturnType<typeof vi.fn> };
    child: Target;
    events: Record<string, (event: Event) => void>;
    contains: (target?: Target | null) => boolean;
    querySelector: () => { focus: ReturnType<typeof vi.fn> };
    addEventListener: (name: string, fn: (event: Event) => void) => void;
  } {
    const events: Record<string, (event: Event) => void> = {};
    const summary = { focus: vi.fn() };
    const child: Target = { closest: () => null };
    return {
      open: true,
      summary,
      child,
      events,
      contains: target => target === child,
      querySelector: () => summary,
      addEventListener: (name, fn): void => {
        events[name] = fn;
      },
    };
  }
  const menus = [menu()];
  const scrim = { hidden: false };
  const events: Record<string, (event: Event) => void> = {};
  runInNewContext(script, {
    document: {
      querySelectorAll: () => menus,
      querySelector: (selector: string) => (selector === '[data-page-menu]' ? menus[0] : scrim),
      addEventListener: (name: string, fn: (event: Event) => void) => {
        events[name] = fn;
      },
    },
  });
  return { menus, scrim, events };
}

describe('header menu focus', () => {
  // AFA-219: Tab reaches the theme control and then Copy; Shift+Tab reaches the brand.
  it('dismisses the phone overlay without returning focus when focus leaves it', () => {
    const { menus, scrim } = headerMenus();
    menus[0].events.focusout?.({ relatedTarget: { closest: () => null } });
    menus[0].events.toggle({});
    expect(menus[0].open).toBe(false);
    expect(scrim.hidden).toBe(true);
    expect(menus[0].summary.focus).not.toHaveBeenCalled();
  });

  it('keeps each menu open while focus moves within it', () => {
    expect.hasAssertions();
    const { menus } = headerMenus();
    for (const menu of menus) {
      menu.events.focusout?.({ relatedTarget: menu.child });
      expect(menu.open).toBe(true);
    }
  });

  it('dismisses the menu when focus leaves the document', () => {
    expect.hasAssertions();
    const { menus } = headerMenus();
    for (const menu of menus) {
      menu.events.focusout?.({ relatedTarget: null });
      expect(menu.open).toBe(false);
      expect(menu.summary.focus).not.toHaveBeenCalled();
    }
  });

  it('keeps pointer choices available when pressing them clears keyboard focus', () => {
    expect.hasAssertions();
    const { menus, events } = headerMenus();
    for (const menu of menus) {
      events.pointerdown?.({ target: menu.child });
      menu.events.focusout?.({ relatedTarget: null });
      expect(menu.open).toBe(true);
      events.pointerup?.({});
      menu.child.closest = () => menu.child;
      menu.events.click({ target: menu.child });
      expect(menu.open).toBe(false);
    }
  });

  it.each(['pointerup', 'pointercancel'])('clears the pointer guard after %s', event => {
    expect.hasAssertions();
    const { menus, events } = headerMenus();
    for (const menu of menus) {
      events.pointerdown?.({ target: menu.child });
      events[event]?.({});
      menu.events.focusout?.({ relatedTarget: null });
      expect(menu.open).toBe(false);
    }
  });

  it('still dismisses menus when a pointer press outside clears focus', () => {
    const { menus, events } = headerMenus();
    events.pointerdown?.({ target: menus[0].child });
    events.pointerdown?.({ target: { closest: () => null } });
    menus[0].events.focusout?.({ relatedTarget: null });
    expect(menus[0].open).toBe(false);
  });

  it('still returns focus to the summary on Escape', () => {
    const { menus, events } = headerMenus();
    events.keydown({ key: 'Escape' });
    expect(menus[0].open).toBe(false);
    expect(menus[0].summary.focus).toHaveBeenCalledOnce();
  });
});
