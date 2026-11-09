import { createRequire } from 'node:module';
import { env } from 'node:process';

// The package as a CommonJS project loads it: Node's own require, from the directory that
// vitest.package.config.ts names.
const load = createRequire(env.FLUENT_MEASURES_FROM ?? '');
const loaded = load('@afahy/fluent-measures') as typeof import('../../src');

export const { parseMeasurement } = loaded;
