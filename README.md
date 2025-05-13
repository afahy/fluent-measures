# fluent-measures

[![CI](https://github.com/afahy/fluent-measures/actions/workflows/ci.yml/badge.svg)](https://github.com/afahy/fluent-measures/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/%40afahy%2Ffluent-measures.svg)](https://badge.fury.io/js/%40afahy%2Ffluent-measures)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@afahy/fluent-measures)](https://bundlephobia.com/package/@afahy/fluent-measures)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/afahy/fluent-measures/blob/main/LICENSE)

A lightweight TypeScript library that converts everyday height and weight descriptions into structured data.

Use this library to process user-generated text containing anthropometric measurements, such as in health apps, fitness trackers, or web forms. It handles input like "5' 11"" or "five feet eleven inches" and supports both metric and imperial units.

The parser can handle common spelling mistakes and phrasing variations using Levenshtein distance for fuzzy matching. It returns reliable, normalized output suitable for computation or display.

## Features

- Parses height and weight in both metric and imperial units (`lb`, `kg`, `ft`, `in`, `cm`, `m`)
- Handles numeric and written-out expressions (`5' 11"`, `five feet eleven inches`, or `one hundred fifty pounds`)
- Supports both strict and fuzzy matching to accommodate exact or loosely formatted input (`5 foot 11 inc` → `71 in`)
- Normalizes output for consistent downstream use (e.g. math, display, storage)
- Zero dependencies
- Tree-shakeable
- Supports both ESM and CommonJS

## Installation

```bash
npm install @afahy/fluent-measures
```

```bash
yarn add @afahy/fluent-measures
```

```bash
pnpm add @afahy/fluent-measures
```

## Usage

```typescript
import { parseMeasurement } from '@afahy/fluent-measures';
```

Basic height measurement

```typescript
const heightFt = parseMeasurement('6 ft');
/* { value: 6, unit: 'ft', type: 'height', matches: [{ value: 6, unit: 'ft' }], raw: '6 ft' } */
```

Complex height with multiple unit matches and normalization to centimeters

```typescript
const heightCm = parseMeasurement('5\' 11"', {
  type: 'height',
  normalizedUnit: 'cm',
});
/* { value: 180.34, unit: 'cm', type: 'height', matches: [{ value: 5, unit: 'ft' }, { value: 11, unit: 'in' }], raw: '5\' 11"' } */
```

Basic weight measurement

```typescript
const weightLbs = parseMeasurement('150 lbs');
/* { value: 150, unit: 'lb', type: 'weight', matches: [{ value: 150, unit: 'lb' }], raw: '150 lbs' } */
```

Weight with spelled-out text

```typescript
const weightKg = parseMeasurement('eighty kilograms', { type: 'weight' });
/* { value: 80, unit: 'kg', type: 'weight', matches: [{ value: 80, unit: 'kg' }], raw: 'eighty kilograms' } */
```

Convert weight from pounds to kilograms

```typescript
const weightConverted = parseMeasurement('150 lbs', {
  type: 'weight',
  normalizedUnit: 'kg',
});
/* { value: 68.04, unit: 'kg', type: 'weight', matches: [{ value: 150, unit: 'lb' }], raw: '150 lbs' } */
```

Handle unqualified values with unit inference

```typescript
const inferredHeight = parseMeasurement('72', {
  type: 'height',
  allowUnqualified: true,
  inferUnit: 'imperial',
});
/* { value: 72, unit: 'in', type: 'height', raw: '72' } */
```

Use fuzzy matching for greater flexibility

```typescript
const fuzzyHeight = parseMeasurement('5 foot 10 inches', { fuzziness: 1 });
/* { value: 70, unit: 'in', type: 'height', raw: '5 foot 10 inches' } */
```

No matches found

```typescript
const invalidInput = parseMeasurement('not a measurement');
// null
```

## API Reference

### `parseMeasurement(input, options?): ParsedValue | null`

Parse a string input into a structured measurement object.

#### Parameters

- `input: string` - The measurement string to parse (e.g., "6 ft", "150 lbs", "180 cm")
- `options?: ParseOptions` - Optional configuration object

#### `ParseOptions`

```typescript
interface ParseOptions {
  // Specify the measurement type to parse
  type?: 'height' | 'weight';

  // Tolerance level for fuzzy unit matching (0-2)
  fuzziness?: number;

  // Allow parsing numbers without explicit units
  allowUnqualified?: boolean;

  // System to use when inferring units for unqualified values
  inferUnit?: 'metric' | 'imperial';

  // Convert all components to this unit in the output
  normalizedUnit?: 'ft' | 'in' | 'cm' | 'm' | 'lb' | 'kg';
}
```

#### `ParsedValue`

```typescript
interface ParsedValue {
  // The numeric value of the measurement
  value: number;

  // The unit of measurement
  unit: 'ft' | 'in' | 'cm' | 'm' | 'lb' | 'kg' | null;

  // The type of measurement (height or weight)
  type: 'height' | 'weight';

  // Array of individual component matches for complex measurements
  matches: Array<{
    value: number;
    unit: 'ft' | 'in' | 'cm' | 'm' | 'lb' | 'kg' | null;
  }>;

  // The original input string
  raw: string;
}
```

## Supported Units

### Height

- **Imperial**: ft (feet, foot, '), in (inches, ")
- **Metric**: cm (centimeters), m (meters)

### Weight

- **Imperial**: lb (lbs, pounds)
- **Metric**: kg (kilos, kilograms)

## Advanced Use Cases

### Handling Mixed Unit Notations

```typescript
// Handle complex formats like 5'11" (feet and inches)
const heightMixed = parseMeasurement('5\'11"', {
  type: 'height',
});
// Returns matches for both feet and inches with total in inches

// Handle written-out formats
const height = parseMeasurement('five foot ten', { type: 'height' });
// { value: 70, unit: 'in', type: 'height', raw: 'five foot ten' }
```

### Fuzzy Matching

Enabling fuzzy matching allows the parser to be more forgiving with typos and variations:

```typescript
// With fuzzy matching enabled
const result = parseMeasurement('5 foots 10 inc', { fuzziness: 2 });
// Successfully matches despite typos

// Without fuzzy matching
const strict = parseMeasurement('5 foots 10 inc');
// Returns null due to exact matching requirement
```

### Number Format Handling

The parser supports various number formats:

```typescript
// Decimal values
parseMeasurement('72.5 kg'); // { value: 72.5, unit: 'kg', ... }

// Spelled-out numbers
parseMeasurement('one hundred fifty pounds'); // { value: 150, unit: 'lb', ... }

// Mixed formats
parseMeasurement('one hundred and 50 pounds'); // { value: 150, unit: 'lb', ... }
```

## Troubleshooting

### Common Issues

#### Unexpected `null` Results

If `parseMeasurement` returns `null`, check these common causes:

1. **Unsupported Unit**: The library only supports specific units for height and weight.
2. **Ambiguous Input**: The input text doesn't clearly indicate a height or weight. Try specifying the `type` option.
3. **Invalid Format**: The input format isn't recognized. Try increasing the `fuzziness` value.

#### Unit Detection Issues

If the wrong unit is detected:

```typescript
// Explicitly specify the measurement type
parseMeasurement('72', { type: 'height', allowUnqualified: true });

// For unqualified values, specify the unit system
parseMeasurement('72', {
  type: 'height',
  allowUnqualified: true,
  inferUnit: 'imperial', // or 'metric'
});
```

#### CommonJS Usage

For CommonJS environments:

```javascript
// Use require instead of import
const { parseMeasurement } = require('@afahy/fluent-measures');
```

## Development

```bash
# Clone the repository
git clone https://github.com/afahy/fluent-measures.git
cd fluent-measures

# Install dependencies
pnpm install

# Run tests
pnpm test

# Build the package
pnpm build

# Run in development mode
pnpm dev
```

## License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/afahy/fluent-measures/blob/main/LICENSE) file in the repository for details.

© 2025 Adam Fahy (afahy)
