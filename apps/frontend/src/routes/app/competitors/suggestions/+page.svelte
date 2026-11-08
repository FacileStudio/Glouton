<script lang="ts">
  import { PageHeader } from '@facile/muse';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { useT } from '$lib/i18n';
  import CompetitorTabs from '$lib/components/competitors/CompetitorTabs.svelte';
  import SuggestionQueue from '$lib/components/competitors/SuggestionQueue.svelte';

  const t = useT();
  const teamId = $derived(teamContextStore.getTeamId());
  let refresh = $state(0);
</script>

<PageHeader title={t('nav.competitors')} />

<div class="flex flex-col gap-4">
  <CompetitorTabs active="suggestions" {teamId} {refresh} />
  <SuggestionQueue {teamId} onChange={() => (refresh += 1)} />
</div>
