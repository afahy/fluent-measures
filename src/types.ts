export type Unit = 'ft' | 'in' | 'cm' | 'm' | 'lb' | 'kg';

export type MeasurementType = 'height' | 'weight';

export interface ParseOptions {
  /**
   * Maximum raw input.length before trimming or parsing; defaults to 1000.
   * Must be a number of at least 1. Use Infinity for no limit; invalid values throw.
   */
  maxLength?: number;
  type?: MeasurementType;
  fuzziness?: number;
  /**
   * Read a number that has no unit. Without `type`, `parseMeasurement` can throw an error.
   */
  allowUnqualified?: boolean;
  /**
   * The unit system for a number that has no unit. Without it, or with 'imperial', a height is
   * in inches and a weight in pounds. With 'metric', a weight is in kilograms, a height below 3
   * in meters, and any other height in centimeters.
   */
  inferUnit?: 'metric' | 'imperial';
  /**
   * The unit to normalize the final value to. It also selects the measurement type, so a weight
   * unit reads only a weight. A `type` that contradicts it throws an error. Bare shorthand such
   * as "5-11", and `allowUnqualified`, still need `type`.
   */
  normalizedUnit?: Unit;
}

export interface Match {
  value: number;
  unit: Unit | null;
}

export interface ParsedValue {
  value: number;
  unit: Unit | null;
  type: MeasurementType;
  matches: Match[];
  raw: string;
}
