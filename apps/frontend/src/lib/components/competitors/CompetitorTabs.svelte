<script lang="ts">
  import { onMount } from 'svelte';
  import { Tabs } from '@facile/muse';
  import { QUIET } from '@repo/trpc-client';
  import { trpc } from '$lib/trpc';
  import { ws } from '$lib/websocket';
  import { useT } from '$lib/i18n';

  let { active, teamId, refresh = 0 }: { active: 'list' | 'suggestions'; teamId?: string; refresh?: number } = $props();

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

  const items = $derived([
    { id: 'list', label: t('discovery.tab.list'), icon: 'solar:ranking-linear', href: '/app/competitors' },
    {
      id: 'suggestions',
      label: t('discovery.tab.suggestions'),
      icon: 'solar:magnifer-linear',
      href: '/app/competitors/suggestions',
      badge: fresh > 0 ? t('discovery.newBadge', { count: fresh }) : undefined,
    },
  ]);
</script>

<Tabs {items} value={active} label={t('discovery.tabs')} />
