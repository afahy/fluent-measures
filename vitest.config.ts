import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // A test that runs no expect fails (AGENTS.md rule 11), also when its expects are in a loop
    // that runs zero times and that the lint doesn't see (AFA-70).
    expect: { requireAssertions: true },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**'],
      exclude: ['coverage/**', 'dist/**', '**/[.]**', 'commitlint.config.js', 'tests/**'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
