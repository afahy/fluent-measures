import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('stryker.config.json', 'utf8'));
export default {
  ...config,
  ignorePatterns: [...(config.ignorePatterns ?? []), 'reports/**'],
  // Only the aggregate checks break. A small shard can legitimately score below it.
  thresholds: { ...config.thresholds, break: null },
};
