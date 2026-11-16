import { describe, expect, test } from 'bun:test';
import { rows } from '$lib/i18n/rows';
import { fitTone } from './fit';

const CODES = [
  'target.unset', 'target.category_match', 'target.keyword_match', 'target.category_family', 'target.no_match',
  'area.unset', 'area.area_match', 'area.outside_area',
  'audit.no_website', 'audit.not_audited', 'audit.audit_clean', 'audit.audit_gaps',
  'reach.reachable', 'reach.unreachable',
  'activity.new', 'activity.fresh', 'activity.old', 'activity.just_contacted', 'activity.waiting', 'activity.follow_up_due', 'activity.dormant', 'activity.over_contacted',
  'history.history_none', 'history.history_won', 'history.history_lost',
  'size.size_unknown', 'size.size_sme', 'size.size_large',
];
const GAPS = ['ssl_invalid', 'seo_title_missing', 'seo_description_missing', 'slow'];
const WAYS = ['email_verified', 'email', 'phone'];
const EVENTS = ['PRICE_CHANGED', 'PLAN_ADDED', 'PLAN_REMOVED', 'FREE_TIER_APPEARED', 'FREE_TIER_REMOVED'];
const STATUSES = [
  'extracted', 'skipped_bulle_off', 'skipped_no_ai_access', 'skipped_no_token', 'skipped_plan_limit', 'skipped_daily_cap', 'skipped_budget',
  'skipped_already_attempted', 'failed_no_page_text', 'failed_bad_output', 'failed_unreachable', 'failed_other',
];

describe('fit and price labels', () => {
  test('every reason code the server can return has a localized line', () => {
    const missing = [
      ...CODES.map((code) => `fit.${code}`),
      ...GAPS.map((code) => `fit.gap.${code}`),
      ...WAYS.map((code) => `fit.way.${code}`),
      ...EVENTS.flatMap((kind) => [`timeline.event.${kind}`, `timeline.badge.${kind}`]),
      ...STATUSES.map((status) => `priceStatus.${status}`),
    ].filter((key) => !(key in rows));
    expect(missing).toEqual([]);
  });

  test('a score reads as strong, possible or weak', () => {
    expect([fitTone(91), fitTone(70), fitTone(69), fitTone(40), fitTone(39), fitTone(0)]).toEqual(['success', 'success', 'warning', 'warning', 'neutral', 'neutral']);
  });
});
