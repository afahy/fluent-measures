export type Unit = 'ft' | 'in' | 'cm' | 'm' | 'lb' | 'kg';

export type MeasurementType = 'height' | 'weight';

export interface ParseOptions {
  type?: MeasurementType;
  fuzziness?: number;
  allowUnqualified?: boolean;
  inferUnit?: 'metric' | 'imperial';
  normalizedUnit?: Unit; // The unit to normalize the final value to
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
