# fluent-measures

Documented package: **@afahy/fluent-measures@0.3.0**.
Source revision: [cb98f756d473517d4c9e9347d27b4142968a83b9](https://github.com/afahy/fluent-measures/tree/cb98f756d473517d4c9e9347d27b4142968a83b9).

[Documentation](https://afahy.github.io/fluent-measures/versions/0.3.0/) · [Markdown reference](https://afahy.github.io/fluent-measures/versions/0.3.0/README.md) · [Parsing rules](https://afahy.github.io/fluent-measures/versions/0.3.0/PARSING.md) · [Agent index (llms.txt)](https://afahy.github.io/fluent-measures/versions/0.3.0/llms.txt)

[![CI](https://github.com/afahy/fluent-measures/actions/workflows/ci.yml/badge.svg)](https://github.com/afahy/fluent-measures/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/%40afahy%2Ffluent-measures.svg)](https://badge.fury.io/js/%40afahy%2Ffluent-measures)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@afahy/fluent-measures)](https://bundlephobia.com/package/@afahy/fluent-measures)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/afahy/fluent-measures/blob/cb98f756d473517d4c9e9347d27b4142968a83b9/LICENSE)

A TypeScript library that reads a height or a weight from everyday text, such as `5' 11"` or
`eighty kilograms`, and returns its value, unit and measurement type.

Use it to read measurements that people type, for example in health apps, fitness trackers and
web forms. The result is `null` when the complete entry is unsupported, incomplete or ambiguous.
Your app can then ask the person again.

[Documentation](https://afahy.github.io/fluent-measures/versions/0.3.0/) ·
[Markdown reference](https://afahy.github.io/fluent-measures/versions/0.3.0/README.md) ·
[Agent index (llms.txt)](https://afahy.github.io/fluent-measures/versions/0.3.0/llms.txt)


## Features

- Reads heights and weights in `ft`, `in`, `cm`, `m`, `lb` and `kg`
- Reads numbers in digits or in words, as in `5' 11"`, `five feet eleven inches` and
  `one hundred fifty pounds`
- Reads thousands separators and decimal commas, as in `1,000 lbs` and `72,5 kg`
- Reads unit names with one spelling error when you set `fuzzy: true`, as in `5 foot 11 inc`
- Converts the result to the unit that you set in `normalizedUnit`
- Has no dependencies
- Is at most 6.0 kB for ESM and 6.0 kB for CommonJS, minified and compressed with Brotli; CI
  enforces these limits
- Supports ESM and CommonJS

## Installation

```bash
npm install @afahy/fluent-measures@0.3.0
```

You can also use `yarn add` or `pnpm add`.

## Usage

```typescript
import { parseMeasurement } from '@afahy/fluent-measures';
```

In CommonJS, use `require`:

```javascript
const { parseMeasurement } = require('@afahy/fluent-measures');
```

The unit in the text shows whether it is a height or a weight, so these calls need no options:

```typescript
parseMeasurement('6 ft');
// { value: 6, unit: 'ft', type: 'height', matches: [{ value: 6, unit: 'ft' }], raw: '6 ft' }

parseMeasurement('150 lbs');
// { value: 150, unit: 'lb', type: 'weight', matches: [{ value: 150, unit: 'lb' }], raw: '150 lbs' }
```

A height in feet and inches gives the total in inches, and `matches` lists each part:

```typescript
parseMeasurement('five foot ten', { type: 'height' });
// { value: 70, unit: 'in', type: 'height', matches: [{ value: 5, unit: 'ft' }, { value: 10, unit: 'in' }], raw: 'five foot ten' }
```

Set `type` when a field expects one kind of measurement, such as a weight. A single measurement
must have that kind, so a height typed into a weight field returns `null`. A complete height/weight pair
requires `type` or `normalizedUnit` to select one; an invalid part rejects the whole entry:

```typescript
parseMeasurement('eighty kilograms', { type: 'weight' });
// { value: 80, unit: 'kg', type: 'weight', matches: [{ value: 80, unit: 'kg' }], raw: 'eighty kilograms' }
```

Set `normalizedUnit` to get the result in the unit that you store. `matches` keeps each part in
its unit from the text:

```typescript
parseMeasurement('5\' 11"', { type: 'height', normalizedUnit: 'cm' });
// { value: 180.34, unit: 'cm', type: 'height', matches: [{ value: 5, unit: 'ft' }, { value: 11, unit: 'in' }], raw: '5\' 11"' }

parseMeasurement('150 lbs', { type: 'weight', normalizedUnit: 'kg' });
// { value: 68.0388555, unit: 'kg', type: 'weight', matches: [{ value: 150, unit: 'lb' }], raw: '150 lbs' }
```

People sometimes type only a number, for example in a calculator field labeled “Height (in)”.
Set `defaultUnit` to that field's source unit. Written units take precedence; `normalizedUnit`
only chooses the output unit and measurement type. It never supplies a source unit:

```typescript
parseMeasurement('72', { defaultUnit: 'in' });
// { value: 72, unit: 'in', type: 'height', matches: [{ value: 72, unit: 'in' }], raw: '72' }
```

Set `fuzzy: true` to read unit names that have one spelling error:

```typescript
parseMeasurement('5 foots 10 inc', { fuzzy: true });
// { value: 70, unit: 'in', type: 'height', matches: [{ value: 5, unit: 'ft' }, { value: 10, unit: 'in' }], raw: '5 foots 10 inc' }
```

Text with no measurement returns `null`, so check the result before you use it:

```typescript
parseMeasurement('not a measurement');
// null
```

## API reference

### `parseMeasurement(input, options?): ParsedValue | null`

Reads one height or weight from a string.

#### Parameters

- `input: string`: the text to read, for example "6 ft", "150 lbs" or "180 cm"
- `options?: ParseOptions`: optional settings

#### `ParseOptions`

```typescript
interface ParseOptions {
  // The largest raw input.length before trimming or parsing; defaults to 1000.
  // Must be a number >= 1, or Infinity for no limit. Other values throw.
  maxLength?: number;

  // The measurement type to return from a valid complete entry
  type?: 'height' | 'weight';

  // Read a unit name with one spelling error, such as foots or ponds. Without it, a unit name
  // must be exact. Must be true or false when supplied.
  fuzzy?: boolean;

  // Source unit for one complete number with no unit. Without it, a bare number returns null.
  // Written units win. No magnitude guessing: 1.8 with defaultUnit: 'cm' means 1.8 cm.
  // Must agree with the dimension selected by type or normalizedUnit, when supplied.
  defaultUnit?: 'ft' | 'in' | 'cm' | 'm' | 'lb' | 'kg';

  // The unit of the result. It also selects the measurement type from a valid complete entry.
  // A type that contradicts it throws an error. Shorthand such as 5-11 still needs type.
  // This option never supplies a source unit for a bare number.
  normalizedUnit?: 'ft' | 'in' | 'cm' | 'm' | 'lb' | 'kg';
}
```

For string input, these checks run before raw length or text: the options object shape,
`maxLength`, `type`, `normalizedUnit`, `defaultUnit`, `fuzzy`, retired options, then dimension
conflicts. Invalid values for those checks throw, even for empty or overlong strings. Non-string
runtime input returns `null` before reading options. Empty strings and null values for `type` or `normalizedUnit` count as absent;
`defaultUnit` must be one of the six canonical units when defined, so null remains invalid.

Migration: remove `allowUnqualified` and `inferUnit`. Either retired option throws when its value
is defined, including `false`; an explicitly `undefined` property is absent. Replace imperial
height/weight inference with `defaultUnit: 'in'`/`'lb'`, metric weight with `'kg'`, and choose
`'m'` or `'cm'` explicitly for height. The parser no longer guesses meters below 3. A default
applies only to an entire unwrapped number, including supported fractions or number words.

`fuzziness` is retired too. Any defined value throws, including `0` and `Infinity`; an explicitly
`undefined` property is absent. Replace `fuzziness: 1` or `2` with `fuzzy: true`, and remove
`fuzziness: 0`. `fuzzy` reads one spelling error, so most unit names with two errors return
`null`. PARSING.md lists the few reviewed typos that `fuzzy` reads beyond that, such as `kilgrm`.

#### `ParsedValue`

```typescript
interface ParsedValue {
  // The value of the measurement
  value: number;

  // The unit of the value
  unit: 'ft' | 'in' | 'cm' | 'm' | 'lb' | 'kg' | null;

  // The measurement type
  type: 'height' | 'weight';

  // Each part of the measurement in its unit from the text, as 5 ft and 11 in for 5' 11"
  matches: Array<{
    value: number;
    unit: 'ft' | 'in' | 'cm' | 'm' | 'lb' | 'kg' | null;
  }>;

  // The input text
  raw: string;
}
```

## Supported units

<!-- cspell:ignore centimetre centimetres kilogramme kilogrammes kilgrm -->

### Height

- **Imperial**: `ft` (feet, foot, `'`) and `in` (inch, inches, `"`)
- **Metric**: `cm` (cms, centimeter, centimeters, centimetre, centimetres) and `m` (meter, meters,
  metre, metres)

### Weight

- **Imperial**: `lb` (lbs, pound, pounds, and `#` directly after a number, as in `185#`)
- **Metric**: `kg` (kgs, kilo, kilos, kilogram, kilograms, kilogramme, kilogrammes)

Most units can also come before their number, as in `kg 70`. The short forms `in` and `m` can
come first only as a label, because before a number they are usually ordinary words.
[PARSING.md](https://afahy.github.io/fluent-measures/versions/0.3.0/PARSING.md#units-before-a-number)
says what counts as a label.

## Limits

```typescript
parseMeasurement('12st 4lb'); // null: stone is not a supported unit
parseMeasurement('150-180 lbs'); // null: a range is not one measurement
parseMeasurement('70 kg (154 lbs)'); // null: two weights, even when they agree
parseMeasurement('210 lbs to 180 lbs'); // null: two weights
```

The parser reads a complete entry, including a few ordinary words around it, such as
`I'm five foot eleven tall` and `about 180 cm`. It does not search arbitrary prose for a
usable fragment. Extra values, malformed fragments, unsupported units and ranges reject the
whole entry. `Top 10 in the class` returns `null`. Quotation marks and brackets cannot
surround the whole entry or a number: `(180 cm)` and `"180 lbs"` return `null`. Brackets still
mark a unit label, as in `Height (in): 72`. Curly quotes after a number are feet and inch marks,
so `5’11”` is 71 inches.

Feet and inches, or meters and centimeters, can form one compound height. Two independent
heights or two independent weights return `null`, even if they are equal or are conversions
of one another. There is no first-result or 1% agreement rule.

A complete pair with exactly one height and one weight is accepted only when `type` or
`normalizedUnit` selects one. For example, `5'11", 180 lbs` returns 71 inches with
`type: 'height'` and 180 pounds with `type: 'weight'`; without a selector it returns `null`.
Both measurements must be valid. The parser does not discard a negative, zero, ranged or
unsupported measurement to return the other one.

Send the current field value to the parser. Keep ages, dates, earlier readings and other
application metadata outside that value. To display an alternate unit, convert the selected
measurement instead of submitting both representations.

[PARSING.md](https://afahy.github.io/fluent-measures/versions/0.3.0/PARSING.md) gives the complete
entry grammar, the words that can surround a measurement, and examples. With `fuzzy: true`, an
ordinary word one letter from a unit name reads as that unit, such as `5 feat` as 5 ft; fuzzy
matching applies only within that grammar.

## Troubleshooting

If `parseMeasurement` returns `null`, look for these causes:

1. The unit isn't supported. See [Supported units](#supported-units).
2. The text doesn't say whether it is a height or a weight. Set `type`.
3. A number has no unit. Set `defaultUnit` to the source unit shown by the field.
4. A unit name has a spelling error. Set `fuzzy: true` to read one error.
5. The entry has a range, duplicate measurement, unsupported fragment or extra text. See
   [Limits](#limits).
6. The input isn't a string. Non-string input returns `null` at runtime; the TypeScript parameter
   remains `string`.
7. The raw `input.length`, before trimming, exceeds `maxLength` (default 1,000). Set a larger
   `maxLength` or `Infinity` for no limit. Length counts UTF-16 code units, as JavaScript does.

## Contributing

See [CONTRIBUTING.md](https://github.com/afahy/fluent-measures/blob/cb98f756d473517d4c9e9347d27b4142968a83b9/CONTRIBUTING.md).

## License

This project uses the MIT License. See the
[LICENSE](https://github.com/afahy/fluent-measures/blob/cb98f756d473517d4c9e9347d27b4142968a83b9/LICENSE) file.

© 2025 Adam Fahy (afahy)

## Documentation for your version

These documents describe **@afahy/fluent-measures@0.3.0**. The [stable site](https://afahy.github.io/fluent-measures/) identifies its documented release; npm can have a newer release while documentation is being verified.

Find your installed version with `npm ls @afahy/fluent-measures` (or `pnpm list` / `yarn why`). Use the matching entry in the [verified versions](https://afahy.github.io/fluent-measures/versions.json). Only complete verified sets are listed. Each version's URLs retain their content across later deployments.

Older tags v0.1.0 and v0.1.1 have no PARSING.md and have package metadata mismatches; use the README shipped with those packages. A missing verified version is not permission to use main's specification for that package.
