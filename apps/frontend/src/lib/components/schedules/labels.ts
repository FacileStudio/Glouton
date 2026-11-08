import { planLimitFrom, type PlanLimitError } from '@facile/muse';
import type { RouterInputs } from '@repo/trpc-client';
import type { Key } from '$lib/i18n/rows';

export type BusinessCategory = RouterInputs['lead']['hunt']['startLocalBusiness']['categories'][number];

export type Frequency = RouterInputs['huntSchedule']['create']['frequency'];

export const FREQUENCIES: readonly Frequency[] = ['DAILY', 'WEEKLY', 'MONTHLY'];

/** The categories a person picks from, with their label and icon. */
export const CATEGORIES: readonly { value: BusinessCategory; label: Key; icon: string }[] = [
  { value: 'restaurant', label: 'hunts.cat.restaurant', icon: 'solar:chef-hat-linear' },
  { value: 'retail', label: 'hunts.cat.retail', icon: 'solar:shop-linear' },
  { value: 'service', label: 'hunts.cat.service', icon: 'solar:case-round-linear' },
  { value: 'healthcare', label: 'hunts.cat.healthcare', icon: 'solar:heart-linear' },
  { value: 'fitness', label: 'hunts.cat.fitness', icon: 'solar:dumbbell-linear' },
  { value: 'beauty', label: 'hunts.cat.beauty', icon: 'solar:scissors-linear' },
  { value: 'automotive', label: 'hunts.cat.automotive', icon: 'solar:wheel-linear' },
  { value: 'professional-services', label: 'hunts.cat.professional', icon: 'solar:user-id-linear' },
  { value: 'hotel', label: 'hunts.cat.hotel', icon: 'solar:bed-linear' },
  { value: 'education', label: 'hunts.cat.education', icon: 'solar:book-linear' },
];

/** The label key of a category, or null for one the picker does not offer. */
export function categoryLabel(value: string): Key | null {
  return CATEGORIES.find((category) => category.value === value)?.label ?? null;
}

/** Splits a comma separated field into trimmed, non-empty entries. */
export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** The plan limit a refused tRPC call carries (`data.plan_limit`), for muse's PlanLimit, or null. */
export function limitFrom(error: unknown): PlanLimitError | null {
  const data = typeof error === 'object' && error !== null ? (error as { data?: { plan_limit?: unknown } }).data : undefined;
  return planLimitFrom(data?.plan_limit);
}
