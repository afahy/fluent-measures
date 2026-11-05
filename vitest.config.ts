import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Vitest matches coverage excludes against absolute paths. Anchor dot paths inside this
// repository so a .t3 or .codex ancestor cannot exclude all source files. Escape glob syntax
// in the checkout path, and use the same forward slashes as Vitest's coverage matcher.
const coverageRoot = fileURLToPath(new URL('.', import.meta.url))
  .replace(/\\/g, '/')
  .replace(/[*?{}()[\]]/g, '\\$&');

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
      exclude: [
        'coverage/**',
        'dist/**',
        `${coverageRoot}**/[.]**`,
        'commitlint.config.js',
        'tests/**',
      ],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
