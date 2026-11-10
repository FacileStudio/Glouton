<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Spinner } from '@facile/muse';
  import { profileStore } from '$lib/stores/profile.svelte';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { homeFor } from '$lib/usage/nav';

  onMount(async () => {
    const profile = profileStore.loaded ? profileStore.value : await profileStore.load(teamContextStore.getTeamId());
    const target = profile && !profile.onboarded ? '/app/start' : homeFor(profileStore.usages());
    await goto(resolve(target as '/app/start'), { replaceState: true });
  });
</script>

<div class="flex justify-center py-24"><Spinner size="lg" /></div>
