import { delimiter, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  findChrome,
  formatPlaces,
  pageUrl,
  shotOptions,
  sweepOptions,
  sweepWidths,
} from '../.github/scripts/docs-chrome.mjs';

// AFA-186: the helpers of pnpm docs:shot and pnpm docs:sweep. The scripts themselves need Chrome,
// so these tests cover the parts that don't.

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

describe('findChrome', () => {
  it('uses CHROME_PATH first', () => {
    expect(findChrome({ CHROME_PATH: '/opt/chrome' }, 'darwin', () => true)).toBe('/opt/chrome');
  });

  it('finds Google Chrome on macOS', () => {
    expect(findChrome({}, 'darwin', path => path === MAC_CHROME)).toBe(MAC_CHROME);
  });

  it('falls back to Chromium on macOS', () => {
    const chromium = '/Applications/Chromium.app/Contents/MacOS/Chromium';
    expect(findChrome({}, 'darwin', path => path === chromium)).toBe(chromium);
  });

  it('looks for Chrome on PATH on Linux, in PATH order', () => {
    const env = { PATH: ['/usr/local/bin', '/usr/bin'].join(delimiter) };
    const found = new Set([join('/usr/bin', 'google-chrome'), join('/usr/local/bin', 'chromium')]);
    expect(findChrome(env, 'linux', path => found.has(path))).toBe(
      join('/usr/local/bin', 'chromium')
    );
  });

  it('finds Chrome under Program Files on Windows', () => {
    const env = { PROGRAMFILES: 'C:\\Program Files' };
    const chrome = join('C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe');
    expect(findChrome(env, 'win32', path => path === chrome)).toBe(chrome);
  });

  it('returns null when no Chrome exists', () => {
    expect(findChrome({ PATH: '/usr/bin' }, 'linux', () => false)).toBeNull();
  });
});

describe('pageUrl', () => {
  it('turns a path into a file URL from the working directory', () => {
    const path = resolve('/repo', 'docs/index.html');
    expect(pageUrl('docs/index.html', '/repo', () => true)).toBe(pathToFileURL(path).href);
  });

  it('keeps a URL as it is', () => {
    expect(pageUrl('http://localhost:8080/', '/repo', () => false)).toBe('http://localhost:8080/');
    expect(pageUrl('file:///tmp/a.html', '/repo', () => false)).toBe('file:///tmp/a.html');
  });

  it('throws for a path with no file', () => {
    expect(() => pageUrl('nope.html', '/repo', () => false)).toThrow(/No page at .*nope\.html/);
  });
});

describe('shotOptions', () => {
  it('defaults to a light phone screenshot of docs/index.html', () => {
    expect(shotOptions([])).toEqual({
      page: 'docs/index.html',
      width: 390,
      height: 844,
      scheme: 'light',
      full: false,
      out: join('docs-shots', '390-light.png'),
    });
  });

  it('reads a page and each option', () => {
    const args = ['other.html', '--width', '1440', '--height', '900', '--scheme', 'dark', '--full'];
    expect(shotOptions(args)).toEqual({
      page: 'other.html',
      width: 1440,
      height: 900,
      scheme: 'dark',
      full: true,
      out: join('docs-shots', '1440-dark-full.png'),
    });
    expect(shotOptions(['--out', 'a.png']).out).toBe('a.png');
  });

  it('rejects bad values', () => {
    expect(() => shotOptions(['--scheme', 'blue'])).toThrow('--scheme must be light or dark');
    expect(() => shotOptions(['--width', '0'])).toThrow('--width must be a whole number');
    expect(() => shotOptions(['--height', '1.5'])).toThrow('--height must be a whole number');
    expect(() => shotOptions(['a.html', 'b.html'])).toThrow('Give one page, not 2');
    expect(() => shotOptions(['--wide'])).toThrow();
  });
});

describe('sweepOptions', () => {
  it('defaults to 320 to 1600px in steps of 10', () => {
    expect(sweepOptions([])).toEqual({
      page: 'docs/index.html',
      from: 320,
      to: 1600,
      step: 10,
      touch: false,
    });
  });

  it('reads a page and each option', () => {
    const args = ['--from', '360', '--to', '400', '--step', '20', '--touch', 'x.html'];
    expect(sweepOptions(args)).toEqual({
      page: 'x.html',
      from: 360,
      to: 400,
      step: 20,
      touch: true,
    });
  });

  it('allows a sweep of one width', () => {
    expect(sweepOptions(['--from', '390', '--to', '390'])).toMatchObject({ from: 390, to: 390 });
  });

  it('rejects bad values', () => {
    expect(() => sweepOptions(['--step', '0'])).toThrow('--step must be a whole number');
    expect(() => sweepOptions(['--from', 'abc'])).toThrow('--from must be a whole number');
    expect(() => sweepOptions(['--from', '500', '--to', '400'])).toThrow(
      '--to (400) must not be less than --from (500)'
    );
  });
});

describe('sweepWidths', () => {
  it('steps from the first width up to the last', () => {
    expect(sweepWidths(320, 360, 10)).toEqual([320, 330, 340, 350, 360]);
  });

  it('stops before a width past the end', () => {
    expect(sweepWidths(320, 345, 10)).toEqual([320, 330, 340]);
    expect(sweepWidths(390, 390, 10)).toEqual([390]);
  });
});

describe('formatPlaces', () => {
  it('joins runs of widths and lists each color scheme', () => {
    const places = [
      { scheme: 'light', width: 320 },
      { scheme: 'light', width: 330 },
      { scheme: 'light', width: 340 },
      { scheme: 'light', width: 400 },
      { scheme: 'dark', width: 320 },
    ];
    expect(formatPlaces(places, 10)).toBe('light 320-340, 400; dark 320');
  });

  it("doesn't join widths across the color schemes", () => {
    const places = [
      { scheme: 'light', width: 1590 },
      { scheme: 'light', width: 1600 },
      { scheme: 'dark', width: 1610 },
    ];
    expect(formatPlaces(places, 10)).toBe('light 1590-1600; dark 1610');
  });

  it('uses the step of the sweep', () => {
    const places = [
      { scheme: 'light', width: 320 },
      { scheme: 'light', width: 340 },
      { scheme: 'light', width: 350 },
    ];
    expect(formatPlaces(places, 20)).toBe('light 320-340, 350');
  });
});
