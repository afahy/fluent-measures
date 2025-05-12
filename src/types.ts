export type Unit = 'ft' | 'in' | 'cm' | 'm' | 'lb' | 'kg';

export type MeasurementType = 'height' | 'weight';

export interface ParseOptions {
  type?: MeasurementType;
  fuzziness?: number;
  allowUnqualified?: boolean;
  inferUnit?: 'metric' | 'imperial';
  normalizedUnit?: Unit; // The unit to normalize the final value to
  returnComponents?: boolean; // Whether to return the individual components
}

export interface ParsedComponent {
  value: number;
  unit: Unit | null;
  match: string;
}

export interface ParsedValue {
  value: number;
  unit: Unit | null;
  type: MeasurementType;
  components?: ParsedComponent[];
  raw: string;
}
