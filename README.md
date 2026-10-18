# fluent-measures

[![CI](https://github.com/afahy/fluent-measures/actions/workflows/ci.yml/badge.svg)](https://github.com/afahy/fluent-measures/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/%40afahy%2Ffluent-measures.svg)](https://badge.fury.io/js/%40afahy%2Ffluent-measures)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@afahy/fluent-measures)](https://bundlephobia.com/package/@afahy/fluent-measures)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/afahy/fluent-measures/blob/main/LICENSE)
[![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/afahy/fluent-measures?utm_source=oss&utm_medium=github&utm_campaign=afahy%2Ffluent-measures&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)](https://coderabbit.ai)

A small TypeScript library that reads a height or a weight from everyday text and returns
structured data.

Use it to read measurements that people type, for example in health apps, fitness trackers and
web forms. It reads metric and imperial units, and numbers in digits or in words. It can also read
unit names that have spelling errors.

## Features

- Reads heights and weights in `ft`, `in`, `cm`, `m`, `lb` and `kg`
- Reads numbers in digits or in words, as in `5' 11"`, `five feet eleven inches` and
  `one hundred fifty pounds`
- Reads thousands separators and decimal commas, as in `1,000 lbs` and `72,5 kg`
- Reads unit names with spelling errors when you set `fuzziness`, as in `5 foot 11 inc`
- Converts the result to the unit that you select
- Has no dependencies
- Is tree-shakeable
- Supports ESM and CommonJS

## Installation

```bash
npm install @afahy/fluent-measures
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

Read a height or a weight:

```typescript
parseMeasurement('6 ft');
// { value: 6, unit: 'ft', type: 'height', matches: [{ value: 6, unit: 'ft' }], raw: '6 ft' }

parseMeasurement('150 lbs');
// { value: 150, unit: 'lb', type: 'weight', matches: [{ value: 150, unit: 'lb' }], raw: '150 lbs' }
```

A height in feet and inches gives the total in inches. `matches` gives each part:

```typescript
parseMeasurement('five foot ten', { type: 'height' });
// { value: 70, unit: 'in', type: 'height', matches: [{ value: 5, unit: 'ft' }, { value: 10, unit: 'in' }], raw: 'five foot ten' }
```

Set `type` to read only a height or only a weight:

```typescript
parseMeasurement('eighty kilograms', { type: 'weight' });
// { value: 80, unit: 'kg', type: 'weight', matches: [{ value: 80, unit: 'kg' }], raw: 'eighty kilograms' }
```

Set `normalizedUnit` to convert the result to one unit:

```typescript
parseMeasurement('5\' 11"', { type: 'height', normalizedUnit: 'cm' });
// { value: 180.34, unit: 'cm', type: 'height', matches: [{ value: 5, unit: 'ft' }, { value: 11, unit: 'in' }], raw: '5\' 11"' }

parseMeasurement('150 lbs', { type: 'weight', normalizedUnit: 'kg' });
// { value: 68.04, unit: 'kg', type: 'weight', matches: [{ value: 150, unit: 'lb' }], raw: '150 lbs' }
```

Set `allowUnqualified` to read a number that has no unit. `inferUnit` selects the unit system:

```typescript
parseMeasurement('72', { type: 'height', allowUnqualified: true, inferUnit: 'imperial' });
// { value: 72, unit: 'in', type: 'height', matches: [{ value: 72, unit: 'in' }], raw: '72' }
```

Set `fuzziness` to read unit names that have spelling errors:

```typescript
parseMeasurement('5 foots 10 inc', { fuzziness: 2 });
// { value: 70, unit: 'in', type: 'height', matches: [{ value: 5, unit: 'ft' }, { value: 10, unit: 'in' }], raw: '5 foots 10 inc' }
```

Text with no measurement returns `null`:

```typescript
parseMeasurement('not a measurement');
// null
```

## API Reference

### `parseMeasurement(input, options?): ParsedValue | null`

Reads one height or weight from a string.

#### Parameters

- `input: string`: the text to read, for example "6 ft", "150 lbs" or "180 cm"
- `options?: ParseOptions`: optional settings

#### `ParseOptions`

```typescript
interface ParseOptions {
  // The measurement type to read
  type?: 'height' | 'weight';

  // The largest number of spelling errors in a unit name, from 0 to 2. Without it, a unit
  // name must be exact.
  fuzziness?: number;

  // Read a number that has no unit
  allowUnqualified?: boolean;

  // The unit system for a number that has no unit
  inferUnit?: 'metric' | 'imperial';

  // The unit of the result. It also selects the measurement type, so a weight unit reads only a
  // weight. A type that contradicts it throws an error. Shorthand such as 5-11, and
  // allowUnqualified, still need type.
  normalizedUnit?: 'ft' | 'in' | 'cm' | 'm' | 'lb' | 'kg';
}
```

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

## Supported Units

<!-- cspell:ignore centimetre centimetres -->

### Height

- **Imperial**: `ft` (feet, foot, `'`) and `in` (inch, inches, `"`)
- **Metric**: `cm` (centimeter, centimeters, centimetre, centimetres) and `m` (meter, meters,
  metre, metres)

### Weight

- **Imperial**: `lb` (lbs, pound, pounds, and `#` directly after a number, as in `185#`)
- **Metric**: `kg` (kilo, kilos, kilogram, kilograms)

Most units can also come before their number, as in `kg 70`.

## Limits

```typescript
parseMeasurement('12st 4lb'); // null: stone, ounces and grams aren't supported
parseMeasurement('150-180 lbs'); // null: a range isn't one measurement
parseMeasurement('70 kg (154 lbs)'); // { value: 70, unit: 'kg', ... }: the second weight agrees
parseMeasurement('210 lbs to 180 lbs'); // null: the two weights disagree
```

When the text has more than one measurement, the result is the first one. The others must agree
with it within 1%. If not, the result is `null`.

Fuzzy matching can read an ordinary word as a unit. After a number, `in` means inches, also in
ordinary text, so `Top 10 in the class` returns 10 inches.

[PARSING.md](https://github.com/afahy/fluent-measures/blob/main/PARSING.md) gives all the rules,
with examples.

## Troubleshooting

If `parseMeasurement` returns `null`, look for these causes:

1. The unit isn't supported. See [Supported Units](#supported-units).
2. The text doesn't show if it is a height or a weight. Set `type`.
3. A number has no unit. Set `allowUnqualified` and `inferUnit`.
4. A unit name has a spelling error. Set `fuzziness` to 1 or 2.
5. The text has a range, or measurements that disagree. See [Limits](#limits).

## Contributing

See [CONTRIBUTING.md](https://github.com/afahy/fluent-measures/blob/main/CONTRIBUTING.md).

## License

This project uses the MIT License. See the
[LICENSE](https://github.com/afahy/fluent-measures/blob/main/LICENSE) file.

© 2025 Adam Fahy (afahy)
