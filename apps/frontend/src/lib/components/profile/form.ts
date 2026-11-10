import type { Profile } from '$lib/stores/profile.svelte';
import type { Usage } from '$lib/usage/nav';
import type { Target } from './targets';

export const TARGET_USAGES = ['clients', 'competitors', 'missions', 'partners'] as const;
export type TargetUsage = (typeof TARGET_USAGES)[number];

/** The profile as the settings form and the start wizard edit it. */
export interface ProfileForm {
  usages: Usage[];
  offer: string;
  website: string;
  area: string;
  remote: boolean;
  targets: Record<TargetUsage, Target>;
}

function copy(target: Target): Target {
  return { description: target.description, nafCodes: [...target.nafCodes], osmTags: [...target.osmTags], keywords: [...target.keywords] };
}

export function formFrom(profile: Profile | null): ProfileForm {
  const empty: Target = { description: null, nafCodes: [], osmTags: [], keywords: [] };
  const targets = Object.fromEntries(TARGET_USAGES.map((usage) => [usage, copy(profile?.targets[usage] ?? empty)])) as Record<TargetUsage, Target>;
  return {
    usages: (profile?.usages ?? []) as Usage[],
    offer: profile?.offerDescription ?? '',
    website: profile?.website ?? '',
    area: profile?.area ?? '',
    remote: profile?.remote ?? false,
    targets,
  };
}

/** The usages among the target ones that are on, in display order. */
export function activeTargets(usages: Usage[]): TargetUsage[] {
  return TARGET_USAGES.filter((usage) => usages.includes(usage));
}

/** The save payload; only active usages send their target, so turning one off never wipes it. */
export function savePayload(form: ProfileForm, teamId: string | undefined) {
  return {
    teamId,
    usages: form.usages,
    offerDescription: form.offer,
    website: form.website.trim() || null,
    area: form.area,
    remote: form.remote,
    targets: Object.fromEntries(
      activeTargets(form.usages).map((usage) => [usage, { ...form.targets[usage], description: form.targets[usage].description || null }]),
    ),
  };
}
