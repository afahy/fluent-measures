# fluent-measures

[![npm version](https://badge.fury.io/js/fluent-measures.svg)](https://badge.fury.io/js/fluent-measures)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

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
- Small bundle size (<1KB)

## Installation

```bash
npm install fluent-measures
# or
yarn add fluent-measures
# or
pnpm add fluent-measures
```

## Usage

```typescript
import { parseMeasurement } from 'fluent-measures';

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
```

For full documentation, API reference, and examples, visit the [GitHub repository](https://github.com/afahy/fluent-measures).

## License

[MIT](./LICENSE) © 2025 fluent-measures
