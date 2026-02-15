export function extractDomainFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * isValidDomain
 */
export function isValidDomain(domain: string): boolean {
  /**
   * if
   */
  if (!domain) return false;
  /**
   * if
   */
  if (['localhost', '127.0.0.1', '0.0.0.0'].includes(domain)) return false;
  /**
   * if
   */
  if (domain.startsWith('192.168.') || domain.startsWith('10.')) return false;
  /**
   * if
   */
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(domain)) return false;
  return true;
}
