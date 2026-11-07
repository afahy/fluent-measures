import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { afterAll, describe, expect, it, vi, type Mock } from 'vitest';
import { generatePreview } from '../.github/scripts/docs-preview.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const repository = mkdtempSync(join(tmpdir(), 'fm-palette-'));
cpSync(join(root, 'docs'), join(repository, 'docs'), { recursive: true });
cpSync(join(root, '.github/docs-preview'), join(repository, '.github/docs-preview'), {
  recursive: true,
});
const output = generatePreview(repository);
const script = readFileSync(join(repository, '.docs-preview/palette-preview.js'), 'utf8');
const page = readFileSync(join(root, 'docs/index.html'), 'utf8');
const css = readFileSync(join(root, 'docs/tailwind.css'), 'utf8');
afterAll(() => rmSync(repository, { recursive: true, force: true }));

function files(directory: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => {
        const path = join(entry.parentPath, entry.name);
        return [path.slice(directory.length + 1), readFileSync(path).toString('base64')];
      })
  );
}

function rootTokens(source: string): Record<string, string> {
  const block = source.match(/:root\s*\{([^}]+)\}/)?.[1] ?? '';
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v])
  );
}

// Expectations come from the selected Atlas common + palette tokens at ad4c503 (AFA-246),
// and the former Original teal design. Atlas remains canonical in production CSS.
describe('Atlas production and preview boundary', () => {
  it('keeps every deployed source byte unchanged when generating and regenerating a preview', () => {
    const production = files(join(repository, 'docs'));
    writeFileSync(join(repository, '.docs-preview/stale.js'), 'old preview');
    generatePreview(repository);
    expect(files(join(repository, 'docs'))).toEqual(production);
    const generated = files(join(repository, '.docs-preview'));
    expect(Object.keys(generated).sort()).toEqual(
      [...Object.keys(production), 'palette-preview.js', 'palette-preview.css'].sort()
    );
    const { 'index.html': _index, ...copied } = generated;
    const { 'index.html': _source, ...assets } = production;
    expect(copied).toMatchObject(assets);
    expect(readFileSync(output, 'utf8')).toBe(
      page.replace(
        '  </head>',
        '    <link rel="stylesheet" href="palette-preview.css" />\n    <script src="palette-preview.js"></script>\n  </head>'
      )
    );
  });

  it('uploads only docs, with no switcher assets, loader, control or query opt-in', () => {
    expect.hasAssertions();
    const workflow = readFileSync(join(root, '.github/workflows/deploy-docs.yml'), 'utf8');
    expect(workflow.match(/\bpath:\s*([^\n]+)/g)).toEqual(['path: docs']);
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toContain('/.docs-preview/');
    const deployed = files(join(root, 'docs'));
    expect(Object.keys(deployed).some(name => /palette|switcher|preview/i.test(name))).toBe(false);
    for (const [name, encoded] of Object.entries(deployed).filter(([name]) =>
      /\.(html|css|js)$/.test(name)
    )) {
      expect(Buffer.from(encoded, 'base64').toString(), name).not.toMatch(
        /palette-preview|palette-choice|data-palette|fluent-measures:palette|switcher|searchParams/
      );
    }
  });

  it.each([
    [
      'light',
      {
        bg: '#fafbfc',
        'bg-tint': '#f2f4f8',
        heading: '#202329',
        text: '#353b43',
        'text-muted': '#59616b',
        accent: '#2456b3',
        'accent-hover': '#1b448f',
        'accent-soft': '#e7ebf3',
        'code-bg': '#f3f4f7',
        'code-head': '#eaecf1',
        'code-text': '#282e36',
        'tok-keyword': '#2456b3',
        'tok-string': '#2c665e',
        'result-value': '#202329',
      },
    ],
    [
      'dark',
      {
        bg: '#0f1115',
        'bg-tint': '#12161c',
        heading: '#f2f2f4',
        text: '#d1d4d9',
        'text-muted': '#afb5bf',
        accent: '#8db5ff',
        'accent-hover': '#afcbff',
        'accent-soft': '#1f2633',
        'code-bg': '#191d24',
        'code-head': '#1f242d',
        'code-text': '#e5e8ed',
        'tok-keyword': '#8db5ff',
        'tok-string': '#a0d5bd',
        'result-value': '#f2f2f4',
      },
    ],
  ])('ships static Atlas %s tokens for system/no-script rendering', (mode, expected) => {
    const source = mode === 'light' ? css : page;
    expect(rootTokens(source)).toMatchObject(expected);
    expect(page).toContain('<style media="(prefers-color-scheme: dark)" data-dark-theme>');
    expect(page).toContain(`content="${expected.bg}" media="(prefers-color-scheme: ${mode})"`);
  });

  it('keeps code results neutral and callout borders in the chosen accent family', () => {
    expect(css).toMatch(/\.code\s*\{\s*--result-value: var\(--code-text\)/);
    expect(css).toMatch(
      /\.result b,[^{]+\{[^}]*color: var\(--result-value\)[^}]*font-weight: 650/s
    );
    expect(css).toMatch(/\.callout\s*\{[^}]*--callout-line: var\(--accent-line\)/s);
    expect(page).not.toContain('--callout-line: rgba(45, 212, 191');
    expect(page).toContain("fill='%232456b3'");
  });

  it.each([
    { saved: 'light', systemDark: true, theme: 'light', media: 'not all', color: '#fafbfc' },
    { saved: 'dark', systemDark: false, theme: 'dark', media: 'all', color: '#0f1115' },
    {
      saved: null,
      systemDark: false,
      theme: 'light',
      media: '(prefers-color-scheme: dark)',
      color: '#fafbfc',
    },
    {
      saved: 'invalid',
      systemDark: true,
      theme: 'dark',
      media: '(prefers-color-scheme: dark)',
      color: '#0f1115',
    },
    {
      saved: 'blocked',
      systemDark: true,
      theme: 'dark',
      media: '(prefers-color-scheme: dark)',
      color: '#0f1115',
    },
  ])(
    'preserves the saved/system theme for $saved / system dark $systemDark',
    ({ saved, systemDark, theme, media, color }) => {
      const dataset: Record<string, string> = {};
      const darkSheet = { media: '(prefers-color-scheme: dark)' };
      const meta = { content: '' };
      const query = { matches: systemDark, addEventListener: vi.fn() };
      const window: { fluentMeasuresTheme?: () => void } = {};
      // Extract the known bootstrap from our tracked fixture, not arbitrary HTML.
      const scriptStart = page.indexOf('<script>');
      const scriptEnd = page.indexOf('</script>', scriptStart);
      expect(scriptStart).toBeGreaterThan(-1);
      expect(scriptEnd).toBeGreaterThan(scriptStart);
      runInNewContext(page.slice(scriptStart + '<script>'.length, scriptEnd), {
        window,
        document: {
          documentElement: { dataset },
          querySelector: () => darkSheet,
          querySelectorAll: () => [meta],
        },
        matchMedia: () => query,
        localStorage: {
          getItem: () => {
            if (saved === 'blocked') throw new Error('Storage blocked');
            return saved;
          },
        },
      });
      expect(dataset.theme).toBe(theme);
      expect(darkSheet.media).toBe(media);
      expect(meta.content).toBe(color);
      expect(query.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
      // Returning to System follows a live OS change, independent of the earlier saved preference.
      dataset.themePref = 'system';
      query.matches = !systemDark;
      window.fluentMeasuresTheme?.();
      expect(dataset.theme).toBe(systemDark ? 'light' : 'dark');
      expect(darkSheet.media).toBe('(prefers-color-scheme: dark)');
    }
  );
});

type Callback = () => void | Promise<void>;
class Element {
  value = '';
  textContent = '';
  href = '';
  className = '';
  innerHTML = '';
  attributes: Record<string, string> = {};
  listeners: Record<string, Callback> = {};
  children: Element[] = [];
  options: { value: string; textContent: string }[] = [];
  get selectedOptions(): { value: string; textContent: string }[] {
    return this.options.filter(option => option.value === this.value);
  }
  setAttribute(key: string, value: string): void {
    this.attributes[key] = value;
  }
  addEventListener(event: string, listener: Callback): void {
    this.listeners[event] = listener;
  }
  append(child: Element): void {
    this.children.push(child);
  }
}

type Preview = {
  colors: Map<string, string>;
  dataset: Record<string, string>;
  preference: Map<string, string>;
  meta: { content: string };
  panel: Element;
  select: Element;
  status: Element;
  exit: Element;
  location: URL;
  writeText: Mock<(text: string) => Promise<void>>;
  insert: Mock<() => void>;
  choose: (value: string) => void | Promise<void>;
  reset: Callback;
  copy: Callback;
  changeTheme: Callback;
};

function preview(
  search = '',
  options: {
    saved?: string;
    storageBlocked?: boolean;
    historyBlocked?: boolean;
    clipboardBlocked?: boolean;
    ready?: boolean;
  } = {}
): Preview {
  const colors = new Map<string, string>();
  const dataset: Record<string, string> = { theme: 'light', themePref: 'system' };
  const preference = new Map([['fluent-measures:theme', 'system']]);
  if (options.saved) preference.set('fluent-measures:palette', options.saved);
  const location = new URL(`file:///repo/.docs-preview/index.html${search}`);
  const meta = { content: '#fafbfc' };
  const select = new Element();
  const status = new Element();
  const reset = new Element();
  const copy = new Element();
  const exit = new Element();
  const panel = new Element();
  const controls: Record<string, Element> = {
    select,
    '[role="status"]': status,
    '[data-palette-reset]': reset,
    '[data-palette-link]': copy,
    '[data-palette-exit]': exit,
  };
  Object.assign(panel, { querySelector: (key: string) => controls[key] });
  let observer: Callback = () => undefined;
  let initialize: Callback = () => undefined;
  const insert = vi.fn(() => {
    select.options = [
      ...panel.innerHTML.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g),
    ].map(([, value, textContent]) => ({ value, textContent }));
  });
  const writeText = vi.fn(async (_text: string): Promise<void> => {
    if (options.clipboardBlocked) throw new Error('Clipboard blocked');
  });
  const storage = (action: () => unknown): unknown => {
    if (options.storageBlocked) throw new Error('Storage blocked');
    return action();
  };
  const applyTheme = (): void => {
    meta.content = dataset.theme === 'dark' ? '#0f1115' : '#fafbfc';
  };
  runInNewContext(script, {
    URL,
    location,
    document: {
      readyState: options.ready ? 'complete' : 'loading',
      documentElement: {
        dataset,
        style: {
          setProperty: (key: string, value: string) => colors.set(key, value),
          removeProperty: (key: string) => colors.delete(key),
        },
      },
      querySelectorAll: () => [meta],
      querySelector: () => ({ insertAdjacentElement: insert }),
      createElement: (name: string) => (name === 'section' ? panel : new Element()),
      addEventListener: (_event: string, listener: Callback) => {
        initialize = listener;
      },
    },
    localStorage: {
      getItem: (key: string) => storage(() => preference.get(key)),
      setItem: (key: string, value: string) => storage(() => preference.set(key, value)),
      removeItem: (key: string) => storage(() => preference.delete(key)),
    },
    MutationObserver: class {
      constructor(callback: Callback) {
        observer = callback;
      }
      observe(): void {
        /* Tests trigger the browser's notification. */
      }
    },
    history: {
      replaceState: (_state: unknown, _title: string, url: URL) => {
        if (options.historyBlocked) throw new Error('History blocked');
        location.href = url.href;
      },
    },
    window: { fluentMeasuresTheme: applyTheme },
    navigator: { clipboard: { writeText } },
  });
  initialize();
  return {
    colors,
    dataset,
    preference,
    meta,
    panel,
    select,
    status,
    exit,
    location,
    writeText,
    insert,
    choose: (value: string): void | Promise<void> => {
      select.value = value;
      return select.listeners.change();
    },
    reset: (): void | Promise<void> => reset.listeners.click(),
    copy: (): void | Promise<void> => copy.listeners.click(),
    changeTheme: (): void => {
      dataset.theme = 'dark';
      dataset.themePref = 'dark';
      applyTheme();
      observer();
    },
  };
}

describe('generated palette preview', () => {
  it('defaults to Atlas with all ten families and Original available', () => {
    const result = preview();
    expect(result.dataset.palette).toBe('atlas');
    expect(result.colors.size).toBe(0);
    expect(result.select.value).toBe('atlas');
    expect(result.select.options.map(option => option.value)).toEqual([
      'original',
      'tidal',
      'atlas',
      'iris',
      'grove',
      'vellum',
      'kiln',
      'rosewater',
      'saffron',
      'glacier',
      'damson',
    ]);
    expect(result.panel.innerHTML).toContain('Atlas (production default)');
    expect(result.panel.innerHTML).toContain('aria-live="polite"');
    expect(result.insert).toHaveBeenCalledOnce();
  });

  it.each([
    ['tidal', '#07514d', '#67d8c5'],
    ['iris', '#6842b5', '#bca4f4'],
    ['grove', '#286344', '#8ecba5'],
    ['vellum', '#765b42', '#d6bd98'],
    ['kiln', '#a34425', '#f4ae8b'],
    ['rosewater', '#a53460', '#f0a1be'],
    ['saffron', '#795a10', '#e5c469'],
    ['glacier', '#086794', '#82ccef'],
    ['damson', '#793c78', '#d6a3d1'],
  ])('preserves the judged %s light/dark accent and neutral results', (name, light, dark) => {
    const result = preview(`?palette=${name}`);
    expect(result.colors.get('--accent')).toBe(light);
    expect(result.colors.get('--result-value')).toBe('#202329');
    result.changeTheme();
    expect(result.colors.get('--accent')).toBe(dark);
    expect(result.colors.get('--result-value')).toBe('#f2f2f4');
    expect(result.dataset.palette).toBe(name);
  });

  it('restores legacy Original colors, including local callouts, in both modes', () => {
    const result = preview('?palette=original', { saved: 'grove' });
    expect(result.dataset.palette).toBe('original');
    expect(Object.fromEntries(result.colors)).toMatchObject({
      '--bg': '#ffffff',
      '--accent': '#0f766e',
      '--heading': '#0f172a',
      '--tok-string': '#1a4f96',
      '--null': '#7c3aed',
      '--header-bg': '#ffffff',
      '--original-callout-line': 'rgba(15, 118, 110, 0.28)',
    });
    result.changeTheme();
    expect(Object.fromEntries(result.colors)).toMatchObject({
      '--bg': '#0b0f17',
      '--accent': '#2dd4bf',
      '--heading': '#f1f5f9',
      '--tok-string': '#a5d6ff',
      '--null': '#c4b5fd',
      '--header-bg': 'rgba(11, 15, 23, 0.97)',
      '--original-callout-line': 'rgba(45, 212, 191, 0.3)',
    });
    expect(result.meta.content).toBe('#0b0f17');
    expect(readFileSync(join(repository, '.docs-preview/palette-preview.css'), 'utf8')).toMatch(
      /\[data-palette='original'\][^{]+\{\s*--callout-line: var\(--original-callout-line\)/
    );
  });

  it.each(['', 'unknown', '__proto__', 'constructor', '<script>'])(
    'validates URL palette %s and falls back to Atlas',
    name => {
      const result = preview(`?palette=${encodeURIComponent(name)}`, { saved: 'grove' });
      expect(result.dataset.palette).toBe('atlas');
      expect(result.colors.size).toBe(0);
    }
  );

  it('uses a saved palette unless the URL supplies a valid choice', () => {
    expect(preview('', { saved: 'grove' }).dataset.palette).toBe('grove');
    expect(preview('?palette=kiln', { saved: 'grove' }).dataset.palette).toBe('kiln');
    expect(preview('', { saved: 'invalid' }).dataset.palette).toBe('atlas');
  });

  it('resets to static Atlas and clears only the palette preference and overrides', () => {
    const result = preview('?palette=original#usage');
    result.choose('original');
    expect(result.preference.get('fluent-measures:palette')).toBe('original');
    result.changeTheme();
    result.reset();
    expect(result.dataset).toMatchObject({ palette: 'atlas', theme: 'dark', themePref: 'dark' });
    expect(result.colors.size).toBe(0);
    expect(result.meta.content).toBe('#0f1115');
    expect(result.preference.has('fluent-measures:palette')).toBe(false);
    expect(result.preference.get('fluent-measures:theme')).toBe('system');
    expect(result.location.href).toBe('file:///repo/.docs-preview/index.html?palette=atlas#usage');
    expect(result.select.value).toBe('atlas');
    expect(result.status.textContent).toBe('Reset to Atlas.');
  });

  it('keeps URL selection and reset usable when storage is blocked', () => {
    const result = preview('?palette=grove', { storageBlocked: true, ready: true });
    expect(result.dataset.palette).toBe('grove');
    result.choose('original');
    expect(result.colors.get('--accent')).toBe('#0f766e');
    result.reset();
    expect(result.dataset.palette).toBe('atlas');
    expect(result.colors.size).toBe(0);
    expect(preview('', { storageBlocked: true }).dataset.palette).toBe('atlas');
  });

  it('copies a repeatable palette and anchor link independently of theme', async () => {
    const result = preview('?palette=grove#usage');
    result.changeTheme();
    result.choose('iris');
    await result.copy();
    expect(result.writeText).toHaveBeenCalledWith(
      'file:///repo/.docs-preview/index.html?palette=iris#usage'
    );
    expect(result.preference.get('fluent-measures:palette')).toBe('iris');
    expect(result.dataset.themePref).toBe('dark');
    expect(result.status.textContent).toBe('Preview link copied.');
    expect(result.exit.href).toBe('file:///repo/docs/index.html#usage');
    result.location.hash = '#api';
    result.exit.listeners.click();
    expect(result.exit.href).toBe('file:///repo/docs/index.html#api');
  });

  it('offers the actual link when clipboard and file history are unavailable', async () => {
    const result = preview('#usage', { clipboardBlocked: true, historyBlocked: true });
    result.choose('original');
    await result.copy();
    expect(result.status.children[0].href).toBe(
      'file:///repo/.docs-preview/index.html?palette=original#usage'
    );
    expect(result.status.children[0].textContent).toBe('Open preview link to copy');
    expect(result.colors.get('--accent')).toBe('#0f766e');
  });
});
