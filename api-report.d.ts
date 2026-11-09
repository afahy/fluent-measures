type Unit = 'ft' | 'in' | 'cm' | 'm' | 'lb' | 'kg';
type MeasurementType = 'height' | 'weight';
interface ParseOptions {
  maxLength?: number;
  type?: MeasurementType;
  fuzzy?: boolean;
  defaultUnit?: Unit;
  normalizedUnit?: Unit;
}
interface Match {
  value: number;
  unit: Unit | null;
}
interface ParsedValue {
  value: number;
  unit: Unit | null;
  type: MeasurementType;
  matches: Match[];
  raw: string;
}
declare function parseMeasurement(input: string, options?: ParseOptions): ParsedValue | null;
export { type MeasurementType, type ParseOptions, type ParsedValue, type Unit, parseMeasurement };
