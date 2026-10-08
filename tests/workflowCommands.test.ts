import { describe, expect, it } from 'vitest';
import { escapeData, escapeProperty, logText } from '../.github/scripts/workflow-commands.mjs';

// AFA-79: GitHub's rules for workflow commands, as `@actions/core` applies them. A message writes
// "%" as %25, CR as %0D and LF as %0A. A property also writes ":" as %3A and "," as %2C.
describe('workflow command escapes', () => {
  it.each([
    ['src/units.ts', 'src/units.ts'],
    ['50%', '50%25'],
    ['a\rb', 'a%0Db'],
    ['a\nb', 'a%0Ab'],
    ['a\r\n::warning::b', 'a%0D%0A::warning::b'],
    ['%0A', '%250A'],
  ])('escapes the message %j as %j', (text, escaped) => {
    expect(escapeData(text)).toBe(escaped);
  });

  it.each([
    ['src/units.ts', 'src/units.ts'],
    ['src/a,b.ts', 'src/a%2Cb.ts'],
    ['src/a:b.ts', 'src/a%3Ab.ts'],
    ['src/a%b.ts', 'src/a%25b.ts'],
    ['src/a\nb.ts', 'src/a%0Ab.ts'],
    ['src/a\r,b:c.ts', 'src/a%0D%2Cb%3Ac.ts'],
  ])('escapes the property %j as %j', (text, escaped) => {
    expect(escapeProperty(text)).toBe(escaped);
  });

  // A plain log line writes CR and LF as `\r` and `\n`, so a name can't start a new line. It
  // writes a backslash as `\\`, so a backslash and "n" don't look like a line break.
  it.each([
    ['src/units.ts', 'src/units.ts'],
    ['src/a\nb.ts', 'src/a\\nb.ts'],
    ['src/a\r\n::error::b', 'src/a\\r\\n::error::b'],
    ['src/a\\nb.ts', 'src/a\\\\nb.ts'],
  ])('writes %j in a log line as %j', (text, written) => {
    expect(logText(text)).toBe(written);
  });
});
