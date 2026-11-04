// Fills a template of this skill, such as judge-brief.md, and writes the result to a file.
//
//   node .claude/skills/design-hill-climb/fill.mjs <template> <out> NAME=value NAME=@file ...
//
// A placeholder is a name in capitals in braces, such as {ROUND}. A value that starts with "@" is
// the path of a file that holds the value. A note for editors in an HTML comment at the top of the
// template doesn't go into the result. The script stops with an error, and writes nothing,
// when a placeholder has no value, a value has no placeholder, or a value is empty. Each value
// goes into the text as it is: it isn't read again for placeholders.
import { readFileSync, writeFileSync } from 'node:fs';

const fail = message => {
  console.error(`fill.mjs: ${message}`);
  process.exit(1);
};

const read = path => {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    return fail(`can't read ${path}: ${error.message}`);
  }
};

const [template, out, ...pairs] = process.argv.slice(2);
if (!template || !out) {
  fail('usage: node fill.mjs <template> <out> NAME=value NAME=@file ...');
}

const values = new Map();
for (const pair of pairs) {
  const match = /^([A-Z][A-Z0-9_]*)=(.*)$/s.exec(pair);
  if (!match) fail(`"${pair}" isn't NAME=value or NAME=@file.`);
  const [, name, raw] = match;
  if (values.has(name)) fail(`${name} has two values.`);
  const value = raw.startsWith('@') ? read(raw.slice(1)).trim() : raw.trim();
  if (value === '') fail(`${name} is empty. Write "None." when there is nothing to say.`);
  values.set(name, value);
}

const placeholder = /\{([A-Z][A-Z0-9_]*)\}/g;
const text = read(template).replace(/^<!--[\s\S]*?-->\s*/, '');
const names = new Set([...text.matchAll(placeholder)].map(match => match[1]));
const missing = [...names].filter(name => !values.has(name));
if (missing.length > 0) fail(`no value for ${missing.join(', ')}.`);
const unused = [...values.keys()].filter(name => !names.has(name));
if (unused.length > 0) fail(`${template} has no placeholder for ${unused.join(', ')}.`);

writeFileSync(
  out,
  text.replace(placeholder, (_, name) => values.get(name))
);
console.log(`Wrote ${out}.`);
