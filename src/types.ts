export type Unit = 'ft' | 'in' | 'cm' | 'm' | 'lb' | 'kg';

export type MeasurementType = 'height' | 'weight';

export interface ParseOptions {
  type?: MeasurementType;
  fuzziness?: number;
  allowUnqualified?: boolean;
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
