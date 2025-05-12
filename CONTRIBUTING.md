# Contributing to fluent-measures

We love your input! We want to make contributing to fluent-measures as easy and transparent as possible.

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

## Development Setup

```bash
# Clone the repository
git clone https://github.com/your-username/fluent-measures.git

# Install dependencies
pnpm install

# Run tests
pnpm test

# Build the project
pnpm build

# Run in development mode
pnpm dev
```

## Pull Request Process

1. Update the README.md with details of changes if needed
2. Add tests for any new functionality
3. Create a changeset describing your changes (`pnpm changeset`)
4. The PR will be merged once you have the sign-off of at least one maintainer

## Any contributions you make will be under the MIT Software License

In short, all your submissions to fluent-measures will be under the same [MIT License](LICENSE) that covers the project.
