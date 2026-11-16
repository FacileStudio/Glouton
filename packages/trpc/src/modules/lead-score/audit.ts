export function isRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** The weaknesses a stored audit shows: an invalid certificate, a missing page title or description, a low performance score. */
export function auditGaps(audit: unknown): string[] {
  const data = isRecord(audit);
  if (!data) return [];
  const gaps: string[] = [];
  const ssl = isRecord(data.ssl);
  if (ssl && ssl.valid === false) gaps.push('ssl_invalid');
  const seo = isRecord(data.seo);
  if (seo && !String(seo.title ?? '').trim()) gaps.push('seo_title_missing');
  if (seo && !String(seo.description ?? '').trim()) gaps.push('seo_description_missing');
  const performance = isRecord(data.performance);
  if (typeof performance?.performanceScore === 'number' && performance.performanceScore < 50) gaps.push('slow');
  return gaps;
}

/** The first whole number an employee range like "11-50" or "250+ employees" names, or null. */
export function employeeCount(audit: unknown): number | null {
  const info = isRecord(isRecord(audit)?.companyInfo);
  const match = /\d[\d\s.,]*/.exec(String(info?.employees ?? ''));
  const count = match ? Number(match[0].replace(/[\s.,]/g, '')) : NaN;
  return Number.isSafeInteger(count) && count > 0 ? count : null;
}
