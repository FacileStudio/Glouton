import { UNTRUSTED_RULE } from './prompt';

const COMPETITOR_SITE = "a competitor's website";

/** The data rule of UNTRUSTED_RULE for a data block whose text comes from another origin. */
export function untrustedRule(origin: string): string {
  return UNTRUSTED_RULE.replace(COMPETITOR_SITE, origin);
}
