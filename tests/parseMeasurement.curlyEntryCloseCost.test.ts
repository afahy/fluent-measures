import { describe, expect, it } from 'vitest';
import { parseWithin, underStryker } from './timing';

describe('curly entry close normalization work', () => {
  // The quotation context must stop at an earlier closing mark, not rescan the whole entry.
  // Confirm this 500 ms CPU budget against both hosted coverage jobs before merging.
  it.skipIf(underStryker)('rejects many internal marks without losing the final close', () => {
    expect(parseWithin(`“${'1’'.repeat(40_000)}”`, 500, { maxLength: Infinity })).toBeNull();
  });
});
