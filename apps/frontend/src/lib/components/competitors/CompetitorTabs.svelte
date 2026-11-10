<script lang="ts">
  import { onMount } from 'svelte';
  import SectionTabs from '$lib/components/nav/SectionTabs.svelte';
  import { QUIET } from '@repo/trpc-client';
  import { trpc } from '$lib/trpc';
  import { ws } from '$lib/websocket';
  import { useT } from '$lib/i18n';

  let { teamId, refresh = 0 }: { teamId?: string; refresh?: number } = $props();

  const t = useT();
  let fresh = $state(0);

  async function load() {
    fresh = (await trpc.competitorDiscovery.counts.query({ teamId }, { context: QUIET }).catch(() => ({ fresh: 0 }))).fresh;
  }

  $effect(() => {
    void refresh;
    void load();
  });

  onMount(() => {
    const off = [ws.on('competitor-discovery:done', () => void load()), ws.on('competitor:new-registered', () => void load())];
    return () => off.forEach((stop) => stop());
  });

  const badges = $derived({ suggestions: fresh > 0 ? t('discovery.newBadge', { count: fresh }) : undefined });
</script>

<SectionTabs section="competitors" {badges} />
