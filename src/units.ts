import { MeasurementType, Unit } from './types';

// Each alias group starts with its canonical unit.
export const UNIT_ALIASES: Record<MeasurementType, [Unit, ...string[]][]> = {
  height: [
    ['ft', 'feet', 'foot', "'"],
    ['in', 'inch', 'inches', '"'],
    ['cm', 'centimeter', 'centimeters'],
    ['m', 'meter', 'meters'],
  ],
  weight: [
    ['lb', 'lbs', 'pound', 'pounds'],
    ['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'],
  ],
};

// Short aliases that are usually ordinary words before a number, as in "in 2020" and "M 28".
// They can come before their number only as a label, such as "(in)" or "m:", which the
// tokenizer spells out as the alias given here.
export const LABEL_ALIASES = new Map([
  ['in', 'inch'],
  ['m', 'meter'],
]);

// The unit of the next smaller part of a compound measurement, as in "5 ft 11 in" and
// "1 m 80 cm". Inches have no smaller part.
export const NEXT_PART: Partial<Record<Unit, Unit>> = { ft: 'in', m: 'cm' };

// Weight units the library doesn't support. A weight with a part in one of them returns null
// rather than the supported part alone, as in "12st 4lb".
export const UNSUPPORTED_WEIGHT_UNITS = /^(?:st|stones?|oz|ounces?|g|grams?)$/;

// Height conversion functions
export const ftToIn = (value: number): number => value * 12;

export const inToFt = (value: number): number => value / 12;

export const mToCm = (value: number): number => value * 100;

export const cmToM = (value: number): number => value / 100;

export const inToCm = (value: number): number => value * 2.54;

export const cmToIn = (value: number): number => value / 2.54;

export const ftToCm = (value: number): number => value * 12 * 2.54;

export const cmToFt = (value: number): number => value / (12 * 2.54);

// Weight conversion functions
export const lbToKg = (value: number): number => value * 0.45359237;

export const kgToLb = (value: number): number => value / 0.45359237;

export const unitConversions: Record<string, Record<string, (value: number) => number>> = {
  ft: { in: ftToIn, cm: ftToCm, m: value => cmToM(ftToCm(value)) },
  in: { ft: inToFt, cm: inToCm, m: value => cmToM(inToCm(value)) },
  cm: { in: cmToIn, ft: cmToFt, m: cmToM },
  m: { cm: mToCm, in: value => cmToIn(mToCm(value)), ft: value => cmToFt(mToCm(value)) },
  lb: { kg: lbToKg },
  kg: { lb: kgToLb },
};
