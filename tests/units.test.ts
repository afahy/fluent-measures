import { describe, it, expect } from 'vitest';
import {
  ftToIn,
  inToFt,
  mToCm,
  cmToM,
  inToCm,
  cmToIn,
  ftToCm,
  cmToFt,
  lbToKg,
  kgToLb,
} from '../src/units';

describe('unit conversions', () => {
  describe('height conversions', () => {
    it('converts feet to inches', () => {
      expect(ftToIn(1)).toBe(12);
      expect(ftToIn(5.5)).toBe(66);
    });

    it('converts inches to feet', () => {
      expect(inToFt(12)).toBe(1);
      expect(inToFt(66)).toBe(5.5);
    });

    it('converts meters to centimeters', () => {
      expect(mToCm(1)).toBe(100);
      expect(mToCm(1.8)).toBe(180);
    });

    it('converts centimeters to meters', () => {
      expect(cmToM(100)).toBe(1);
      expect(cmToM(180)).toBe(1.8);
    });

    it('converts inches to centimeters', () => {
      expect(inToCm(1)).toBe(2.54);
      expect(inToCm(12)).toBe(30.48);
    });

    it('converts centimeters to inches', () => {
      expect(cmToIn(2.54)).toBe(1);
      expect(cmToIn(30.48)).toBe(12);
    });

    it('converts feet to centimeters', () => {
      expect(ftToCm(1)).toBe(30.48);
      expect(ftToCm(6)).toBe(182.88);
    });

    it('converts centimeters to feet', () => {
      expect(cmToFt(30.48)).toBe(1);
      expect(cmToFt(182.88)).toBe(6);
    });
  });

  describe('weight conversions', () => {
    it('converts pounds to kilograms', () => {
      expect(lbToKg(1)).toBe(0.45359237);
      expect(lbToKg(100)).toBe(45.359237);
    });

    it('converts kilograms to pounds', () => {
      expect(kgToLb(0.45359237)).toBe(1);
      expect(kgToLb(45.359237)).toBe(100);
    });
  });
});
