# fluent-measures

[![CI](https://github.com/afahy/fluent-measures/actions/workflows/ci.yml/badge.svg)](https://github.com/afahy/fluent-measures/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/%40afahy%2Ffluent-measures.svg)](https://badge.fury.io/js/%40afahy%2Ffluent-measures)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@afahy/fluent-measures)](https://bundlephobia.com/package/@afahy/fluent-measures)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/afahy/fluent-measures/blob/main/LICENSE)

A TypeScript library for parsing freeform height and weight inputs—like `5' 11"`, `180 cm`, or
`eighty kilograms`—into typed numbers in the unit your app stores.

Built for health apps, fitness trackers, BMR/BMI calculators, and intake forms where users type
into a plain text field instead of separate unit dropdowns. When an entry is incomplete,
unsupported, or ambiguous, `parseMeasurement` returns `null` instead of guessing so your UI can
prompt them to clarify.

[Documentation](https://afahy.github.io/fluent-measures/) ·
[Markdown reference](https://afahy.github.io/fluent-measures/README.md) ·
[Agent index (llms.txt)](https://afahy.github.io/fluent-measures/llms.txt)

## Features

- **Metric and imperial units** — parses `ft`, `in`, `cm`, `m`, `lb`, and `kg`, including symbols
  (`'`, `"`, `#`) and British spellings
- **Digits, words, and regional decimals** — reads `5' 11"`, `five feet eleven inches`,
  `one hundred fifty pounds`, thousands separators (`1,000 lbs`), and decimal commas (`72,5 kg`)
- **Unit conversion** — set `normalizedUnit` to return the unit your database or formula expects
  while keeping the original parts in `matches`
- **Optional typo tolerance** — turn on `fuzzy: true` to accept one-letter spelling mistakes in
  unit names, like `5 foot 11 inc`
- **Returns `null` on bad input** — rejects ranges, duplicate readings, and unrelated prose rather
  than silently guessing
- **Zero dependencies, small bundle** — capped at 6.0 kB for ESM and 6.0 kB for CommonJS
  (minified and compressed with Brotli, enforced in CI), with both ESM and CommonJS exports

## Installation

```bash
npm install @afahy/fluent-measures
```

Or use `yarn add` / `pnpm add`.

## Usage

```typescript
import { parseMeasurement } from '@afahy/fluent-measures';
```

Using CommonJS?

```javascript
const { parseMeasurement } = require('@afahy/fluent-measures');
```

When the input already includes a unit, the parser knows whether it's a height or a weight—no
options needed:

```typescript
parseMeasurement('6 ft');
// { value: 6, unit: 'ft', type: 'height', matches: [{ value: 6, unit: 'ft' }], raw: '6 ft' }

parseMeasurement('150 lbs');
// { value: 150, unit: 'lb', type: 'weight', matches: [{ value: 150, unit: 'lb' }], raw: '150 lbs' }
```

Compound heights in feet and inches automatically combine into total inches, while `matches` keeps
each part as written:

```typescript
parseMeasurement('five foot ten', { type: 'height' });
// { value: 70, unit: 'in', type: 'height', matches: [{ value: 5, unit: 'ft' }, { value: 10, unit: 'in' }], raw: 'five foot ten' }
```

Pass `type` whenever a form field only accepts one kind of measurement. If someone types a height
into a weight input, it returns `null` instead of saving the wrong data. If a single string holds
both a height and a weight (like `5'11", 180 lbs`), `type` or `normalizedUnit` picks the one you
want—both halves still have to be valid:

```typescript
parseMeasurement('eighty kilograms', { type: 'weight' });
// { value: 80, unit: 'kg', type: 'weight', matches: [{ value: 80, unit: 'kg' }], raw: 'eighty kilograms' }
```

Set `normalizedUnit` to convert directly to the unit you store or run calculations on (like `cm`
or `kg`). `matches` still preserves each part in the user's original unit:

```typescript
parseMeasurement('5\' 11"', { type: 'height', normalizedUnit: 'cm' });
// { value: 180.34, unit: 'cm', type: 'height', matches: [{ value: 5, unit: 'ft' }, { value: 11, unit: 'in' }], raw: '5\' 11"' }

parseMeasurement('150 lbs', { type: 'weight', normalizedUnit: 'kg' });
// { value: 68.0388555, unit: 'kg', type: 'weight', matches: [{ value: 150, unit: 'lb' }], raw: '150 lbs' }
```

When a field label already says “Height (in)” or “Weight (kg)”, users will often type a bare
number. Set `defaultUnit` to tell the parser what that field assumes. Written units always win, and
`normalizedUnit` only picks the output unit—it never acts as a fallback input unit:

```typescript
parseMeasurement('72', { defaultUnit: 'in' });
// { value: 72, unit: 'in', type: 'height', matches: [{ value: 72, unit: 'in' }], raw: '72' }
```

Turn on `fuzzy: true` to forgive a single-letter spelling error in a unit name:

```typescript
parseMeasurement('5 foots 10 inc', { fuzzy: true });
// { value: 70, unit: 'in', type: 'height', matches: [{ value: 5, unit: 'ft' }, { value: 10, unit: 'in' }], raw: '5 foots 10 inc' }
```

Anything that can't be parsed reliably returns `null`, so always guard before using the result:

```typescript
parseMeasurement('not a measurement');
// null
```

## API reference

### `parseMeasurement(input, options?): ParsedValue | null`

Parses one height or weight from a string and returns `null` when the entry can't be parsed safely.

#### Parameters

- `input: string`: raw text from your form or user, like `"6 ft"`, `"150 lbs"`, or `"180 cm"`
- `options?: ParseOptions`: optional settings to lock the type, normalize units, set a bare-number
  default, or tolerate typos

#### `ParseOptions`

```typescript
interface ParseOptions {
  // Max raw input.length (before trimming or parsing); defaults to 1000.
  // Must be >= 1, or Infinity for no limit. Other values throw.
  maxLength?: number;

  // Lock parsing to heights or weights, or pick one side of a height/weight pair.
  type?: 'height' | 'weight';

  // Accept a unit name with one spelling error (like "foots" or "ponds").
  // Defaults to false (exact unit names only). Non-boolean values throw.
  fuzzy?: boolean;

  // Fallback unit for a bare number with no written unit. Without it, bare numbers return null.
  // Written units win, and there's no magnitude guessing (1.8 with defaultUnit: 'cm' is 1.8 cm).
  // Must agree with the dimension selected by type or normalizedUnit, when supplied.
  defaultUnit?: 'ft' | 'in' | 'cm' | 'm' | 'lb' | 'kg';

  // Output unit for the returned value. Also selects the measurement type from a valid entry.
  // Throws if it contradicts type. Shorthand like 5-11 still needs type.
  // Never supplies a fallback source unit for a bare number.
  normalizedUnit?: 'ft' | 'in' | 'cm' | 'm' | 'lb' | 'kg';
}
```

For string input, options are validated upfront—before checking length or parsing text—in this
order: the options object shape, `maxLength`, `type`, `normalizedUnit`, `defaultUnit`, `fuzzy`,
retired options, then dimension conflicts. Invalid options throw even for empty or overlong
strings, while non-string runtime input returns `null` before reading options. Empty strings and
`null` for `type` or `normalizedUnit` count as omitted; `defaultUnit` must be one of the six
canonical units whenever defined, so `null` throws.

**Upgrading from an earlier version?**

- `allowUnqualified` and `inferUnit` have been retired and throw whenever defined (including
  `false`; an explicit `undefined` property is ignored). Replace imperial inference with
  `defaultUnit: 'in'` or `'lb'`, metric weight with `'kg'`, and pick `'m'` or `'cm'` explicitly for
  metric height—the parser no longer guesses meters below 3. `defaultUnit` only applies to a bare,
  unwrapped number (including supported fractions and number words).
- `fuzziness` is retired too and throws for any defined value (including `0` and `Infinity`;
  explicit `undefined` is ignored). Replace `fuzziness: 1` or `2` with `fuzzy: true`, and remove
  `fuzziness: 0`. `fuzzy` allows one spelling error, plus a small reviewed list of common typos in
  PARSING.md (such as `kilgrm` and the number word `fourty`).

#### `ParsedValue`

```typescript
interface ParsedValue {
  // Parsed numeric value (already converted if normalizedUnit is set)
  value: number;

  // Canonical unit for value
  unit: 'ft' | 'in' | 'cm' | 'm' | 'lb' | 'kg' | null;

  // Whether the measurement is a height or a weight
  type: 'height' | 'weight';

  // Each part parsed from the input in its original unit, e.g. 5 ft and 11 in for 5' 11"
  matches: Array<{
    value: number;
    unit: 'ft' | 'in' | 'cm' | 'm' | 'lb' | 'kg' | null;
  }>;

  // The untouched input string
  raw: string;
}
```

## Supported units

<!-- cspell:ignore centimetre centimetres kilogramme kilogrammes kilgrm fourty -->

### Height

- **Imperial**: `ft` (`feet`, `foot`, `'`) and `in` (`inch`, `inches`, `"`)
- **Metric**: `cm` (`cms`, `centimeter`, `centimeters`, `centimetre`, `centimetres`) and `m`
  (`meter`, `meters`, `metre`, `metres`)

### Weight

- **Imperial**: `lb` (`lbs`, `pound`, `pounds`, and `#` right after a number, like `185#`)
- **Metric**: `kg` (`kgs`, `kilo`, `kilos`, `kilogram`, `kilograms`, `kilogramme`, `kilogrammes`)

Most units can also come before the number, as in `kg 70`. The short forms `in` and `m` only work
before a number when punctuated as a label (like `in: 72`), because otherwise they're usually
ordinary words. See
[PARSING.md](https://github.com/afahy/fluent-measures/blob/main/PARSING.md#units-before-a-number)
for what counts as a label.

## Limits

```typescript
parseMeasurement('12st 4lb'); // null: stone is not a supported unit
parseMeasurement('150-180 lbs'); // null: a range is not one measurement
parseMeasurement('70 kg (154 lbs)'); // null: two weights, even when they agree
parseMeasurement('210 lbs to 180 lbs'); // null: two weights
```

`fluent-measures` is built for form fields and short replies, not for scraping freeform
paragraphs. Light conversational framing works—things like `I'm five foot eleven tall` or
`about 180 cm`—but extra values, malformed fragments, unsupported units, and ranges reject the
whole entry so bad numbers don't sneak into your app. `Top 10 in the class` returns `null`.
Wrapping the whole entry or a number in quotes or brackets is rejected too (`(180 cm)` and
`"180 lbs"` return `null`), though brackets still work for unit labels like `Height (in): 72`, and
phone curly quotes after a number still count as feet and inch marks (`5’11”` parses as 71 inches).

Feet + inches or meters + centimeters combine into one compound height, but two separate heights or
two separate weights always return `null`—even if they convert to the exact same value. There's no
“take the first one” or 1% agreement rule.

If an entry contains exactly one height and one weight, pass `type` or `normalizedUnit` to select
which one you want: `5'11", 180 lbs` returns 71 inches with `type: 'height'` and 180 pounds with
`type: 'weight'`, or `null` if you don't specify a selector. Both measurements must be valid—the
parser won't drop a negative, zero, ranged, or unsupported value just to salvage the other half.

Pass only the field value you want to parse. Keep ages, dates, previous weigh-ins, and other
metadata outside the string, and convert the parsed result in your app when you need to display a
second unit.

For the full grammar, allowed surrounding words, and edge-case examples, see
[PARSING.md](https://github.com/afahy/fluent-measures/blob/main/PARSING.md). When `fuzzy: true`
is on, any ordinary word one letter off from a unit name matches that unit inside the grammar (for
example, `5 feat` parses as 5 ft).

## Troubleshooting

Getting `null` when you expected a number? It's almost always one of these:

1. **Unsupported unit** — stone, ounces, and grams aren't supported. See
   [Supported units](#supported-units).
2. **Missing `type`** — shorthand like `5-11` or a combined height/weight pair needs `type` (or
   `normalizedUnit` for pairs) to pick what you want.
3. **Bare number with no default** — if a user leaves off the unit, pass `defaultUnit` to match
   your field label.
4. **Typo in the unit name** — pass `fuzzy: true` to accept a single-letter spelling error.
5. **Range, duplicate, or extra text** — ranges, two measurements of the same kind, or extra prose
   reject the whole entry. See [Limits](#limits).
6. **Non-string value** — non-string inputs return `null` at runtime even though the TypeScript
   signature expects `string`.
7. **Over `maxLength`** — raw `input.length` (UTF-16 code units, before trimming) is capped at
   1,000 by default. Pass a higher `maxLength` or `Infinity` if you need longer inputs.

## Documentation for your version

The docs site always labels the exact npm release and source commit it covers. This README in the
repository tracks the checked-out branch, which may be ahead of npm while a release is being
verified.

To check which version your app uses, run `npm ls @afahy/fluent-measures` (or `pnpm list` /
`yarn why`). Then look up that version in the
[verified documentation versions](https://afahy.github.io/fluent-measures/versions.json) index and
open its `versions/<version>/README.md` and `versions/<version>/PARSING.md` links. Versioned docs
stay pinned across future deploys, and only complete verified releases appear in the index.

Git tags use `v<version>` in the
[repository's tag list](https://github.com/afahy/fluent-measures/tags). For **0.2.0**, use the
[tagged README](https://github.com/afahy/fluent-measures/blob/v0.2.0/README.md) and
[tagged parsing rules](https://github.com/afahy/fluent-measures/blob/v0.2.0/PARSING.md) (or the
[raw README](https://raw.githubusercontent.com/afahy/fluent-measures/v0.2.0/README.md) and
[raw parsing rules](https://raw.githubusercontent.com/afahy/fluent-measures/v0.2.0/PARSING.md)).
The [tagged package manifest](https://github.com/afahy/fluent-measures/blob/v0.2.0/package.json)
confirms version 0.2.0. Stay on that tag when clicking links inside an older README, since links to
`main` aren't pinned to the release.

For other versions, check the tag's file list and `package.json` first. Older tags `v0.1.0` and
`v0.1.1` don't have a `PARSING.md` and have metadata quirks (`v0.1.0` uses the unscoped package
name, and `v0.1.1` still lists version 0.1.0). For those releases, rely on the README shipped inside
your installed package rather than the current parsing rules.

## Contributing

See [CONTRIBUTING.md](https://github.com/afahy/fluent-measures/blob/main/CONTRIBUTING.md).

## License

MIT — see [LICENSE](https://github.com/afahy/fluent-measures/blob/main/LICENSE).

© 2025 Adam Fahy (afahy)
