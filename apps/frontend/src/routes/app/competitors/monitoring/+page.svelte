<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { Badge, Card, EmptyState, PageHeader, Spinner, toast } from '@facile/muse';
  import { QUIET } from '@repo/trpc-client';
  import { trpc } from '$lib/trpc';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { useT } from '$lib/i18n';
  import CompetitorTabs from '$lib/components/competitors/CompetitorTabs.svelte';
  import type { CompetitorItem } from '$lib/components/competitors/labels';

  const t = useT();
  const teamId = $derived(teamContextStore.getTeamId());

  let items = $state<CompetitorItem[]>([]);
  let unseen = $state<Record<string, number>>({});
  let loading = $state(true);

  const ranked = $derived([...items].sort((a, b) => (unseen[b.id] ?? 0) - (unseen[a.id] ?? 0) || a.name.localeCompare(b.name)));

  onMount(async () => {
    try {
      items = (await trpc.competitor.list.query({ teamId })).items;
      unseen = await trpc.competitorWatch.unseenCounts.query({ teamId }, { context: QUIET }).catch(() => ({}));
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      loading = false;
    }
  });
</script>

<PageHeader title={t('nav.competitors')} description={t('monitoring.description')} />

<div class="flex flex-col gap-4">
  <CompetitorTabs {teamId} />
  {#if loading}
    <Card class="flex items-center justify-center py-16"><Spinner size="lg" /></Card>
  {:else if items.length === 0}
    <EmptyState icon="solar:eye-linear" title={t('monitoring.none')} description={t('monitoring.noneText')} />
  {:else}
    <ul class="flex flex-col gap-2">
      {#each ranked as c (c.id)}
        <li>
          <a
            href={resolve('/app/competitors/[id]', { id: c.id })}
            class="flex min-h-11 items-center justify-between gap-3 rounded-fc-lg bg-fc-component p-4 hover:bg-fc-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring"
          >
            <span class="min-w-0">
              <span class="block truncate text-fc-sm font-semibold text-fc-fg">{c.name}</span>
              <span class="block truncate text-fc-xs text-fc-fg-muted">{c.domain ?? ''}</span>
            </span>
            {#if unseen[c.id]}
              <Badge tone="warning" class="shrink-0 whitespace-nowrap">{t('watch.badge', { count: unseen[c.id] ?? 0 })}</Badge>
            {:else}
              <Badge class="shrink-0 whitespace-nowrap">{t('monitoring.upToDate')}</Badge>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>
