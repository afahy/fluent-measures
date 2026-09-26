import { describe, it, expect } from 'vitest';
import { parseNumberToken } from '../src/parseNumberToken';

describe('parseNumberToken', () => {
  it('parses numeric tokens', () => {
    expect(parseNumberToken('6')).toEqual(6);
    expect(parseNumberToken('5.5')).toEqual(5.5);
  });

  it('parses spelled-out numbers', () => {
    expect(parseNumberToken('five')).toEqual(5);
    expect(parseNumberToken('eighty')).toEqual(80);
  });

  it('returns null for zero and negative numbers', () => {
    expect(parseNumberToken('0')).toBeNull();
    expect(parseNumberToken('-3')).toBeNull();
    expect(parseNumberToken('zero')).toBeNull();
    expect(parseNumberToken('-five')).toBeNull();
  });

  it('returns null for tokens that are not numbers', () => {
    expect(parseNumberToken('abc')).toBeNull();
    expect(parseNumberToken('ft')).toBeNull();
  });

  it.each(['--5', '--5.5', '--five', '---5'])('rejects repeated minus signs in %s', token => {
    expect(parseNumberToken(token)).toBeNull();
  });
});
