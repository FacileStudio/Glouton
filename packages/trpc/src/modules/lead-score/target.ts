import { tagsForCategory } from '../../taxonomy';
import { WEIGHTS, reason, type FitReason } from './reason';
import type { ScoreLead, ScoreTargets } from './rules';

export function targetReason(lead: ScoreLead, targets: ScoreTargets): FitReason {
  const unset = targets.osmTags.length === 0 && targets.keywords.length === 0;
  if (unset) return reason('target', 'unset', WEIGHTS.target / 2);
  const tags = lead.category ? tagsForCategory(lead.category.trim().toLowerCase()) : [];
  const exact = tags.find((tag) => targets.osmTags.includes(tag));
  if (exact) return reason('target', 'category_match', WEIGHTS.target, exact);
  const text = `${lead.businessName ?? ''} ${lead.category ?? ''}`.toLowerCase();
  const keyword = targets.keywords.find((word) => word && text.includes(word.toLowerCase()));
  if (keyword) return reason('target', 'keyword_match', 18, keyword);
  const family = tags.find((tag) => targets.osmTags.some((own) => own.split('=')[0] === tag.split('=')[0]));
  if (family) return reason('target', 'category_family', 14, family.split('=')[0]!);
  return reason('target', 'no_match', 0);
}

export function areaReason(lead: ScoreLead, area: string | null): FitReason {
  const wanted = area?.trim().toLowerCase();
  if (!wanted) return reason('area', 'unset', WEIGHTS.area / 2);
  const place = [lead.city, lead.country].map((part) => part?.trim().toLowerCase()).filter((part): part is string => Boolean(part));
  const hit = place.find((part) => wanted.includes(part) || part.includes(wanted));
  return hit ? reason('area', 'area_match', WEIGHTS.area, hit) : reason('area', 'outside_area', 0);
}
