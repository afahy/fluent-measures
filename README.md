# fluent-measures

[![CI](https://github.com/afahy/fluent-measures/actions/workflows/ci.yml/badge.svg)](https://github.com/afahy/fluent-measures/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/fluent-measures.svg)](https://badge.fury.io/js/fluent-measures)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

A TypeScript library that uses natural language to parse height and weight measurements. Built with a focus on developer experience, type safety, and performance.

## Features

- Smart parsing of height and weight measurements in both metric and imperial units
- Support for complex notations like `5' 11"` or `five feet eleven inches`
- Spelled-out number parsing (`one hundred fifty pounds` → 150 lb)
- Conversion between units (imperial ↔ metric)
- Fuzzy matching for more flexible input handling
- Comprehensive TypeScript typings
- Zero dependencies
- Tree-shakeable
- ESM and CommonJS support
- Thoroughly tested with 100% coverage
- Small bundle size (<1KB)

## Installation

```bash
npm install @afahy/fluent-measures
# or
yarn add @afahy/fluent-measures
# or
pnpm add @afahy/fluent-measures
```

## Usage

```typescript
import { parseMeasurement } from '@afahy/fluent-measures';

// Height measurements
const heightFt = parseMeasurement('6 ft');
// { value: 6, unit: 'ft', type: 'height', raw: '6 ft' }

// Complex height with components and normalization to centimeters
const heightCm = parseMeasurement('5\' 11"', {
  type: 'height',
  returnComponents: true,
  normalizedUnit: 'cm',
});
/* Returns:
{
  value: 180.34,
  unit: 'cm',
  type: 'height',
  components: [
    { value: 5, unit: 'ft', match: '5\'' },
    { value: 11, unit: 'in', match: '11"' }
  ],
  raw: '5\' 11"'
}
*/

// Weight measurement
const weightLbs = parseMeasurement('150 lbs');
// { value: 150, unit: 'lb', type: 'weight', raw: '150 lbs' }

// Weight with spelled-out text
const weightKg = parseMeasurement('eighty kilograms', { type: 'weight' });
// { value: 80, unit: 'kg', type: 'weight', raw: 'eighty kilograms' }

// Convert weight from pounds to kilograms
const weightConverted = parseMeasurement('150 lbs', {
  type: 'weight',
  normalizedUnit: 'kg',
});
// { value: 68.04, unit: 'kg', type: 'weight', raw: '150 lbs' }

// Handle unqualified values with unit inference
const inferredHeight = parseMeasurement('72', {
  type: 'height',
  allowUnqualified: true,
  inferUnit: 'imperial',
});
// { value: 72, unit: 'in', type: 'height', raw: '72' }

// Use fuzzy matching for greater flexibility
const fuzzyHeight = parseMeasurement('5 foot 10 inches', { fuzziness: 1 });
// { value: 70, unit: 'in', type: 'height', raw: '5 foot 10 inches' }

// Error handling
const invalidInput = parseMeasurement('not a measurement');
// null
```

## API Reference

### parseMeasurement(input, options?): ParsedValue | null

Parse a string input into a structured measurement object.

#### Parameters

- `input: string` - The measurement string to parse (e.g., "6 ft", "150 lbs", "180 cm")
- `options?: ParseOptions` - Optional configuration object

#### ParseOptions

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

  // Include the individual components in the output
  returnComponents?: boolean;
}
```

#### ParsedValue

```typescript
interface ParsedValue {
  // The numeric value of the measurement
  value: number;

  // The unit of measurement
  unit: 'ft' | 'in' | 'cm' | 'm' | 'lb' | 'kg' | null;

  // The type of measurement
  type: 'height' | 'weight';

  // Array of individual measurement components (when returnComponents is true)
  components?: ParsedComponent[];

  // The complete input string
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
  returnComponents: true,
});
// Returns components for both feet and inches with total in inches

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
const { parseMeasurement } = require('fluent-measures');
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

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## Code of Conduct

Please note that this project is released with a [Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

## License

[MIT](LICENSE) © 2025 fluent-measures
