import { MeasurementType, Unit } from './types';

export const UNITS: Record<MeasurementType, Unit[]> = {
  height: ['ft', 'in', 'cm', 'm'],
  weight: ['lb', 'kg'],
};

export const UNIT_ALIASES: Record<Unit, string[]> = {
  ft: ['ft', 'feet', 'foot', "'"],
  in: ['in', 'inch', 'inches', '"'],
  cm: ['cm', 'centimeter', 'centimeters'],
  m: ['m', 'meter', 'meters'],
  lb: ['lb', 'lbs', 'pound', 'pounds'],
  kg: ['kg', 'kilogram', 'kilograms', 'kilos'],
};

export const NORMALIZED_UNITS: Record<MeasurementType, { metric: Unit; imperial: Unit }> = {
  height: { metric: 'cm', imperial: 'in' },
  weight: { metric: 'kg', imperial: 'lb' },
};

// Height conversion functions
export function ftToIn(value: number): number {
  return value * 12;
}

export function inToFt(value: number): number {
  return value / 12;
}

export function mToCm(value: number): number {
  return value * 100;
}

export function cmToM(value: number): number {
  return value / 100;
}

export function inToCm(value: number): number {
  return value * 2.54;
}

export function cmToIn(value: number): number {
  return value / 2.54;
}

export function ftToCm(value: number): number {
  return value * 12 * 2.54;
}

export function cmToFt(value: number): number {
  return value / (12 * 2.54);
}

// Weight conversion functions
export function lbToKg(value: number): number {
  return value * 0.45359237;
}

export function kgToLb(value: number): number {
  return value / 0.45359237;
}
