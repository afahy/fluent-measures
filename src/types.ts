export type Unit = 'ft' | 'in' | 'cm' | 'm' | 'lb' | 'kg';

export type MeasurementType = 'height' | 'weight';

export interface ParseOptions {
  /**
   * Maximum raw input.length before trimming or parsing; defaults to 1000.
   * Must be a number of at least 1. Use Infinity for no limit; invalid values throw.
   */
  maxLength?: number;
  type?: MeasurementType;
  /**
   * Source unit for one complete unwrapped number. Without it, a bare number is rejected.
   * Explicit units win. This unit never depends on the number's magnitude or normalizedUnit.
   * Must match the dimension selected by type or normalizedUnit, if either is supplied.
   */
  defaultUnit?: Unit;
  /**
   * The unit to normalize the final value to. It also selects the measurement type, so a weight
   * unit reads only a weight. A `type` that contradicts it throws an error. Bare shorthand such
   * as "5-11" still needs type. This option does not supply a unit for a bare number.
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
