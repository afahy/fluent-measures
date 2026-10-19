import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // A test that runs no expect fails (AGENTS.md rule 10, AFA-70). This also catches a loop
    // that runs zero times when the lint doesn't see it.
    expect: { requireAssertions: true },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**'],
      exclude: ['coverage/**', 'dist/**', '**/[.]**', 'commitlint.config.js', 'tests/**'],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
