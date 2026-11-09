import type { MeasurementType, Unit } from '../src';

// A test-only model: quantities, unit definitions and writers for a bounded part of the public
// grammar. No tokenizer, parser or production conversion code is used to calculate expectations.
export interface Quantity {
  value: number;
  unit: Unit;
}

// The international definitions: 1 in = 2.54 cm, 1 ft = 12 in, 1 m = 100 cm, 1 lb = 0.45359237 kg.
const CM_PER_UNIT: Record<Unit, number> = { in: 2.54, ft: 30.48, cm: 1, m: 100, lb: 0, kg: 0 };
const KG_PER_UNIT: Record<Unit, number> = { lb: 0.45359237, kg: 1, ft: 0, in: 0, cm: 0, m: 0 };
export const TYPES: Record<Unit, MeasurementType> = {
  ft: 'height',
  in: 'height',
  cm: 'height',
  m: 'height',
  lb: 'weight',
  kg: 'weight',
};
export const UNITS = Object.keys(TYPES) as Unit[];

/** The value in the target unit, from the definitions above. */
export function convert(value: number, from: Unit, to: Unit): number {
  const table = TYPES[from] === 'height' ? CM_PER_UNIT : KG_PER_UNIT;
  return (value * table[from]) / table[to];
}

// The names in "Supported units" in the README, without the marks, which follow other rules.
export const NAMES: Record<Unit, readonly string[]> = {
  ft: ['ft', 'feet', 'foot'],
  in: ['in', 'inch', 'inches'],
  cm: ['cm', 'cms', 'centimeter', 'centimeters', 'centimetre', 'centimetres'],
  m: ['m', 'meter', 'meters', 'metre', 'metres'],
  lb: ['lb', 'lbs', 'pound', 'pounds'],
  kg: ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms', 'kilogramme', 'kilogrammes'],
};

const ONES = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** A number from 1 to 999 in words, as in "one hundred fifty" or "one hundred and fifty". */
export function inWords(value: number, and = false): string {
  if (value < 20) return ONES[value];
  if (value < 100) {
    const ones = value % 10;
    return TENS[Math.floor(value / 10)] + (ones ? ` ${ONES[ones]}` : '');
  }
  const rest = value % 100;
  const hundreds = `${ONES[Math.floor(value / 100)]} hundred`;
  return rest ? `${hundreds}${and ? ' and' : ''} ${inWords(rest)}` : hundreds;
}

// PARSING.md, "Numbers": digits, words, and "one hundred and 50". The writer's domain is
// integers 1..999; it is deliberately not a general number formatter or a reverse parser.
export const NUMBER_FORMS = ['digits', 'words', 'words with and', 'mixed'] as const;
export type NumberForm = (typeof NUMBER_FORMS)[number];

export function writeInteger(value: number, form: NumberForm): string {
  if (form === 'digits') return String(value);
  if (form === 'mixed') {
    const rest = value % 100;
    return value < 100 || rest === 0 ? String(value) : `${inWords(value - rest)} and ${rest}`;
  }
  return inWords(value, form === 'words with and');
}

export const PLACEMENTS = ['suffix', 'prefix', 'colon', 'equals', 'brackets'] as const;
export type Placement = (typeof PLACEMENTS)[number];

// PARSING.md, "Units Before a Number" and "Labels". Bare prefix in/m are not units, so the
// prefix writer uses a colon for those two names. Marks and ambiguous prose are not generated.
export function writeMeasurement(value: string, name: string, placement: Placement): string {
  switch (placement) {
    case 'suffix':
      return `${value} ${name}`;
    case 'prefix':
      return `${name}${name === 'in' || name === 'm' ? ':' : ''} ${value}`;
    case 'colon':
      return `${name}: ${value}`;
    case 'equals':
      return `${name}=${value}`;
    case 'brackets':
      return `(${name}) ${value}`;
  }
}
