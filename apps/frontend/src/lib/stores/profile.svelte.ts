import trpc from '$lib/trpc';
import { QUIET, type RouterOutputs } from '@repo/trpc-client';
import type { Usage } from '$lib/usage/nav';

export type Profile = RouterOutputs['prospect']['get'];

/** The active space's profile: its usages drive the sidebar, `onboarded` the start wizard. */
class ProfileStore {
  value = $state<Profile | null>(null);
  loaded = $state(false);

  usages(): Usage[] {
    return (this.value?.usages ?? []) as Usage[];
  }

  set(profile: Profile): void {
    this.value = profile;
    this.loaded = true;
  }

  async load(teamId: string | undefined): Promise<Profile | null> {
    try {
      this.value = await trpc.prospect.get.query({ teamId }, { context: QUIET });
    } catch {
      this.value = null;
    } finally {
      this.loaded = true;
    }
    return this.value;
  }
}

export const profileStore = new ProfileStore();
