# Contributing to fluent-measures

We love your input! We want to make contributing to fluent-measures as easy and transparent as possible. This library focuses on providing natural language parsing for height and weight measurements with support for both imperial and metric units.

## Development Process

1. Fork the repo and create your branch from `main`.
2. Install dependencies with `pnpm install`
3. Make your changes
4. Add tests if applicable
5. Run tests with `pnpm test`
6. Make sure your code lints with `pnpm lint`
7. Format your code with `pnpm format`
8. Create a changeset using `pnpm changeset`
9. Submit your pull request

## Commit Message Convention

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. This means every commit message should be structured as follows:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Types:

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools

Examples:

- `feat: add metric to imperial conversion`
- `fix: handle negative measurements correctly`
- `docs: update API documentation`
- `test: add more test cases for edge values`

## Project Structure

```
fluent-measures/
├── src/                  # Source code
│   ├── index.ts          # Main export file
│   └── types.ts          # TypeScript type definitions
│
├── tests/                # Test files
│
├── docs/                 # Documentation
│   └── index.html        # Main documentation page
│
├── bench/                # Benchmarks
│   └── index.ts          # Benchmark tests
│
└── [configuration files]
```

## Development Setup

```bash
# Clone the repository
git clone https://github.com/your-username/fluent-measures.git

# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests with coverage report
pnpm test:coverage

# Type checking
pnpm test:types

# Build the project
pnpm build

# Run in development mode (watch for changes)
pnpm dev

# Lint code
pnpm lint

# Format code
pnpm format

# Generate documentation
pnpm docs

# Run benchmarks
pnpm benchmark
```

## Pull Request Process

1. Update the README.md with details of changes if needed
2. Add tests for any new functionality
3. Make sure all tests pass (`pnpm test`) and types check (`pnpm test:types`)
4. Run linting and formatting (`pnpm lint` and `pnpm format`)
5. Create a changeset describing your changes (`pnpm changeset`)
6. The PR will be merged once you have the sign-off of at least one maintainer

## Key Modules

### parseMeasurement.ts

The main entry point for parsing measurements. It processes input strings to extract height and weight measurements by coordinating with other modules.

### matchUnit.ts

Responsible for identifying and matching unit strings in the input (e.g., "ft", "cm", "lbs", etc.) with support for fuzzy matching.

### tokenize.ts

Splits input strings into tokens for processing, handling various formats and special character cases.

### units.ts

Contains unit definitions, aliases, and conversion functions between different units (imperial ↔ metric).

### wordsToNumber.ts

Parses spelled-out numbers into their numeric form (e.g., "eighty-five" → 85).

### levenshtein.ts

Provides fuzzy string matching capabilities using Levenshtein distance algorithm.

## Testing

We aim to maintain 100% test coverage. Each module should have a corresponding test file in the `tests/` directory. When adding new features or fixing bugs, please include tests that cover your changes.

Tests can be run with:

```bash
# Run all tests
pnpm test

# Run tests in watch mode during development
pnpm test:watch

# Generate test coverage report
pnpm test:coverage
```

## Documentation

We use TypeDoc to generate API documentation. Please add proper JSDoc comments to all public functions and types:

````typescript
/**
 * Parses a measurement string into a structured object.
 *
 * @param input - The measurement string to parse
 * @param options - Optional configuration settings
 * @returns A parsed measurement object or null if parsing failed
 *
 * @example
 * ```ts
 * parseMeasurement('6 ft'); // { value: 6, unit: 'ft', type: 'height', raw: '6 ft' }
 * ```
 */
export function parseMeasurement(input: string, options: ParseOptions = {}): ParsedValue | null {
  // ...
}
````

You can generate the documentation locally with:

```bash
pnpm docs
```

## Performance Considerations

This library is designed to be lightweight and performant. When contributing, keep in mind:

1. **Bundle Size**: Avoid adding dependencies when possible
2. **Algorithmic Complexity**: Be mindful of performance in parsing algorithms
3. **Memory Usage**: Avoid unnecessary object creation in hot paths

You can run benchmarks to check performance:

```bash
pnpm benchmark
```

## Any contributions you make will be under the MIT Software License

In short, all your submissions to fluent-measures will be under the same [MIT License](LICENSE) that covers the project.
