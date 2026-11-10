<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { QUIET } from '@repo/trpc-client';
  import SectionTabs from '$lib/components/nav/SectionTabs.svelte';
  import { trpc } from '$lib/trpc';
  import { ws } from '$lib/websocket';
  import { teamContextStore } from '$lib/stores/team-context.svelte';

  let { children } = $props();

  let unseen = $state(0);

  async function refresh() {
    try {
      unseen = (await trpc.job.offerCounts.query({ teamId: teamContextStore.getTeamId() }, { context: QUIET })).unseen;
    } catch {
      unseen = 0;
    }
  }

  $effect(() => {
    void page.url.pathname;
    void refresh();
  });

  onMount(() => ws.on('job-search:done', () => void refresh()));
</script>

<div class="flex flex-col gap-6">
  <SectionTabs section="job" badges={{ offers: unseen > 0 ? String(unseen) : undefined }} />
  {@render children()}
</div>
