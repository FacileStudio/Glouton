import type { Profile } from '$lib/stores/profile.svelte';
import type { Usage } from '$lib/usage/nav';
import type { Target } from './targets';

export const TARGET_USAGES = ['clients', 'competitors', 'missions', 'partners', 'job'] as const;
export type TargetUsage = (typeof TARGET_USAGES)[number];
export type BusinessUsage = Exclude<TargetUsage, 'job'>;

export const JOB_CONTRACTS = ['permanent', 'fixed_term', 'freelance', 'part_time', 'internship', 'apprenticeship'] as const;
export type JobContract = (typeof JOB_CONTRACTS)[number];

/** What a job seeker looks for: a target whose keywords are skills, plus the job's own place, contracts and salary floor. */
export interface JobTarget extends Target {
  role: string;
  location: string;
  remote: boolean;
  contracts: JobContract[];
  salaryMin: number | null;
}

/** The profile as the settings form and the start wizard edit it. */
export interface ProfileForm {
  usages: Usage[];
  offer: string;
  website: string;
  area: string;
  remote: boolean;
  targets: Record<BusinessUsage, Target>;
  job: JobTarget;
}

const BUSINESS: readonly BusinessUsage[] = ['clients', 'competitors', 'missions', 'partners'];

function copy(target: Target): Target {
  return { description: target.description, nafCodes: [...target.nafCodes], osmTags: [...target.osmTags], keywords: [...target.keywords] };
}

export function formFrom(profile: Profile | null): ProfileForm {
  const empty: Target = { description: null, nafCodes: [], osmTags: [], keywords: [] };
  const targets = Object.fromEntries(BUSINESS.map((usage) => [usage, copy(profile?.targets[usage] ?? empty)])) as Record<BusinessUsage, Target>;
  const job = profile?.targets.job;
  return {
    usages: (profile?.usages ?? []) as Usage[],
    offer: profile?.offerDescription ?? '',
    website: profile?.website ?? '',
    area: profile?.area ?? '',
    remote: profile?.remote ?? false,
    targets,
    job: {
      ...copy(job ?? empty),
      role: job?.role ?? '',
      location: job?.location ?? '',
      remote: job?.remote ?? false,
      contracts: [...((job?.contracts ?? []) as JobContract[])],
      salaryMin: job?.salaryMin ?? null,
    },
  };
}

/** The business usages that are on, in display order. Job has its own block. */
export function activeTargets(usages: Usage[]): BusinessUsage[] {
  return BUSINESS.filter((usage) => usages.includes(usage));
}

/** True when a usage other than job is on, so the questions about the business apply. */
export function hasBusiness(usages: Usage[]): boolean {
  return activeTargets(usages).length > 0;
}

/** The save payload; only active usages send their target, so turning one off never wipes it. */
export function savePayload(form: ProfileForm, teamId: string | undefined) {
  const targets: Record<string, unknown> = Object.fromEntries(
    activeTargets(form.usages).map((usage) => [usage, { ...form.targets[usage], description: form.targets[usage].description || null }]),
  );
  if (form.usages.includes('job')) {
    targets.job = {
      ...form.job,
      description: form.job.description || null,
      role: form.job.role.trim() || null,
      location: form.job.location.trim() || null,
      salaryMin: form.job.salaryMin && form.job.salaryMin > 0 ? Math.round(form.job.salaryMin) : null,
    };
  }
  return {
    teamId,
    usages: form.usages,
    offerDescription: form.offer,
    website: form.website.trim() || null,
    area: form.area,
    remote: form.remote,
    targets,
  };
}
