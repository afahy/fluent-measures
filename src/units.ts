import { MeasurementType, Unit } from './types';

// Each alias group starts with its canonical unit.
export const UNIT_ALIASES: Record<MeasurementType, [Unit, ...string[]][]> = {
  height: [
    ['ft', 'feet', 'foot', "'"],
    ['in', 'inch', 'inches', '"'],
    ['cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres'],
    ['m', 'meter', 'meters', 'metre', 'metres'],
  ],
  weight: [
    ['lb', 'lbs', 'pound', 'pounds'],
    ['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'],
  ],
};

// The measurement type of each unit. The type checks that each unit has one.
const TYPES: Record<Unit, MeasurementType> = {
  ft: 'height',
  in: 'height',
  cm: 'height',
  m: 'height',
  lb: 'weight',
  kg: 'weight',
};
// With no prototype, a name such as "constructor" isn't a unit.
export const UNIT_TYPES: Readonly<Record<Unit, MeasurementType>> = Object.assign(
  Object.create(null),
  TYPES
);

// Short aliases that are usually ordinary words before a number, as in "in 2020" and "M 28".
// They can come before their number only as a label, such as "(in)" or "m:", which the
// tokenizer spells out as the alias given here.
export const LABEL_ALIASES = new Map([
  ['in', 'inch'],
  ['m', 'meter'],
]);

// The tokenizer puts one of these tokens before each label, so the parser knows the label's value
// comes after it, as in "age=28, in=72" and "age=28, kg=72". They're words that ordinary input
// doesn't contain. A short alias before ":" or "=" is a field name. Any other label can also be
// the unit of the number before it, as in "72 (in), 180 lbs" and "180 lbs = 82 kg".
export const NAME_MARK = '_name';
export const UNIT_MARK = '_unit';

// The tokenizer puts this token before a label that starts a new field, after a comma, semicolon,
// colon, equals sign or "&", as in "age=28, in=180 lbs". The label can't take the number before
// this token, because that number belongs to the field before it.
export const FIELD_MARK = '_field';

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

// Conversions between units of the same type. There are none between a height and a weight.
export const unitConversions: Record<Unit, Partial<Record<Unit, (value: number) => number>>> = {
  ft: { in: ftToIn, cm: ftToCm, m: value => cmToM(ftToCm(value)) },
  in: { ft: inToFt, cm: inToCm, m: value => cmToM(inToCm(value)) },
  cm: { in: cmToIn, ft: cmToFt, m: cmToM },
  m: { cm: mToCm, in: value => cmToIn(mToCm(value)), ft: value => cmToFt(mToCm(value)) },
  lb: { kg: lbToKg },
  kg: { lb: kgToLb },
};
