export const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

/** A missing score or failed run must not look like a perfect audit. */
export function lighthouseFailures(report) {
  const problems = [];
  if (report?.runtimeError) problems.push(`Lighthouse: ${report.runtimeError.message}`);
  for (const category of CATEGORIES) {
    const score = report?.categories?.[category]?.score;
    if (score !== 1) problems.push(`${category}: expected 100, got ${score * 100}`);
  }
  return problems;
}
