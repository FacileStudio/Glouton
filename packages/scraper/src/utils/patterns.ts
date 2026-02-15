export const EMAIL_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  /\b[A-Za-z0-9._%+-]+\s*@\s*[A-Za-z0-9.-]+\s*\.\s*[A-Z|a-z]{2,}\b/g,
  /\b[A-Za-z0-9._%+-]+\s*\[\s*at\s*\]\s*[A-Za-z0-9.-]+\s*\[\s*dot\s*\]\s*[A-Z|a-z]{2,}\b/gi,
  /\b[A-Za-z0-9._%+-]+\s*\(\s*at\s*\)\s*[A-Za-z0-9.-]+\s*\(\s*dot\s*\)\s*[A-Z|a-z]{2,}\b/gi,
];

export const PHONE_PATTERNS = [
  /\+?1?\s*\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
  /\+?([0-9]{1,3})\s*\(?([0-9]{1,4})\)?[-.\s]?([0-9]{1,4})[-.\s]?([0-9]{1,4})[-.\s]?([0-9]{1,9})/g,
  /\(([0-9]{3})\)\s*([0-9]{3})-([0-9]{4})/g,
  /([0-9]{3})\.([0-9]{3})\.([0-9]{4})/g,
];

export const US_ADDRESS_PATTERN = /\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|road|rd|highway|hwy|square|sq|trail|trl|drive|dr|court|ct|parkway|pkwy|circle|cir|boulevard|blvd|lane|ln|way|walk|place|pl)\b[,.]?\s*(?:(?:apt|apartment|unit|ste|suite)[.\s]*[#]?[\w-]+[,.]?)?\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?/gi;

export const SOCIAL_PATTERNS = {
  linkedin: [
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|company)\/([a-zA-Z0-9-]+)/gi,
    /(?:https?:\/\/)?(?:[a-z]{2}\.)?linkedin\.com\/(?:in|company)\/([a-zA-Z0-9-]+)/gi,
  ],
  twitter: [
    /(?:https?:\/\/)?(?:www\.)?(?:twitter|x)\.com\/([a-zA-Z0-9_]{1,15})/gi,
  ],
  facebook: [
    /(?:https?:\/\/)?(?:www\.)?facebook\.com\/([a-zA-Z0-9.]+)/gi,
    /(?:https?:\/\/)?(?:www\.)?fb\.com\/([a-zA-Z0-9.]+)/gi,
  ],
  instagram: [
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)/gi,
  ],
  youtube: [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:c|channel|user)\/([a-zA-Z0-9_-]+)/gi,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/@([a-zA-Z0-9_-]+)/gi,
  ],
  tiktok: [
    /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@([a-zA-Z0-9_.]+)/gi,
  ],
  github: [
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9-]+)/gi,
  ],
  pinterest: [
    /(?:https?:\/\/)?(?:www\.)?pinterest\.com\/([a-zA-Z0-9_]+)/gi,
  ],
};

export const CONTACT_PAGE_PATTERNS = [
  /contact/i,
  /get-in-touch/i,
  /reach-us/i,
  /connect/i,
  /support/i,
  /help/i,
  /customer-service/i,
];

export const ABOUT_PAGE_PATTERNS = [
  /about/i,
  /about-us/i,
  /who-we-are/i,
  /our-story/i,
  /company/i,
  /team/i,
];

export const EMAIL_OBFUSCATION_PATTERNS = [
  { pattern: /\s*\[at\]\s*/gi, replacement: '@' },
  { pattern: /\s*\(at\)\s*/gi, replacement: '@' },
  { pattern: /\s*\[dot\]\s*/gi, replacement: '.' },
  { pattern: /\s*\(dot\)\s*/gi, replacement: '.' },
  { pattern: /\s*\[AT\]\s*/gi, replacement: '@' },
  { pattern: /\s*\(AT\)\s*/gi, replacement: '@' },
  { pattern: /\s*\[DOT\]\s*/gi, replacement: '.' },
  { pattern: /\s*\(DOT\)\s*/gi, replacement: '.' },
];

export const DISPOSABLE_EMAIL_DOMAINS = [
  'tempmail.com',
  'guerrillamail.com',
  'mailinator.com',
  '10minutemail.com',
  'throwaway.email',
  'temp-mail.org',
  'example.com',
  'test.com',
];

export const COMMON_NON_CONTACT_EMAILS = [
  'noreply@',
  'no-reply@',
  'donotreply@',
  'do-not-reply@',
  'mailer-daemon@',
  'postmaster@',
  'abuse@',
  'spam@',
];

/**
 * cleanEmail
 */
export function cleanEmail(email: string): string {
  let cleaned = email.toLowerCase().trim();

  /**
   * for
   */
  for (const { pattern, replacement } of EMAIL_OBFUSCATION_PATTERNS) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  cleaned = cleaned.replace(/\s+/g, '');

  return cleaned;
}

/**
 * isValidEmail
 */
export function isValidEmail(email: string): boolean {
  /**
   * if
   */
  if (!email || email.length < 5 || email.length > 254) {
    return false;
  }

  const cleaned = cleanEmail(email);

  const domain = cleaned.split('@')[1];
  /**
   * if
   */
  if (domain && DISPOSABLE_EMAIL_DOMAINS.includes(domain)) {
    return false;
  }

  /**
   * for
   */
  for (const prefix of COMMON_NON_CONTACT_EMAILS) {
    /**
     * if
     */
    if (cleaned.startsWith(prefix)) {
      return false;
    }
  }

  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/;
  return emailRegex.test(cleaned);
}

/**
 * cleanPhoneNumber
 */
export function cleanPhoneNumber(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

/**
 * isValidPhoneNumber
 */
export function isValidPhoneNumber(phone: string): boolean {
  const cleaned = cleanPhoneNumber(phone);

  /**
   * if
   */
  if (cleaned.length < 10 || cleaned.length > 15) {
    return false;
  }

  const digitCount = cleaned.replace(/\+/g, '').length;
  return digitCount >= 10 && digitCount <= 15;
}

/**
 * normalizeUrl
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.href;
  } catch {
    /**
     * if
     */
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return `https://${url}`;
    }
    return url;
  }
}
