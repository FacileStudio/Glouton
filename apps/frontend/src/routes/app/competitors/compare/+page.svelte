<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { Badge, Button, Card, EmptyState, PageHeader, Spinner, toast } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { useT } from '$lib/i18n';
  import Battlecard from '$lib/components/competitors/Battlecard.svelte';
  import WinRateBadge from '$lib/components/competitors/WinRateBadge.svelte';
  import type { CompetitorItem } from '$lib/components/competitors/labels';

  const t = useT();
  const teamId = $derived(teamContextStore.getTeamId());

  const ids = $derived(
    Array.from(new Set((page.url.searchParams.get('ids') ?? '').split(',').map((id) => id.trim()).filter(Boolean))),
  );
  const valid = $derived(ids.length >= 2 && ids.length <= 4);

  let items = $state<CompetitorItem[]>([]);
  let loading = $state(true);

  const columns: Record<number, string> = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' };

  onMount(async () => {
    if (!valid) {
      loading = false;
      return;
    }
    try {
      items = await trpc.competitor.compare.query({ teamId, competitorIds: ids });
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      loading = false;
    }
  });
</script>

<PageHeader title={t('competitors.compareTitle')} back={{ href: resolve('/app/competitors'), label: t('competitors.title') }} />

{#if loading}
  <Card class="flex items-center justify-center py-16"><Spinner size="lg" /></Card>
{:else if !valid || items.length === 0}
  <EmptyState icon="solar:align-horizontal-center-linear" title={t('competitors.compareInvalid')}>
    <Button href={resolve('/app/competitors')}>{t('competitors.back')}</Button>
  </EmptyState>
{:else}
  <div class="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
    <div class="grid auto-cols-[minmax(17rem,1fr)] grid-flow-col gap-4 lg:grid-flow-row lg:auto-cols-auto {columns[items.length]}">
      {#each items as c (c.id)}
        <section class="flex min-w-0 flex-col gap-3" aria-label={c.name}>
          <Card href={resolve('/app/competitors/[id]', { id: c.id })} class="flex flex-col gap-2 p-4">
            <h2 class="truncate text-fc-lg font-semibold text-fc-fg">{c.name}</h2>
            {#if c.domain || c.area}<p class="truncate text-fc-xs text-fc-fg-muted">{[c.domain, c.area].filter(Boolean).join(' · ')}</p>{/if}
            <div class="flex flex-wrap items-center gap-1.5">
              <WinRateBadge rate={c.winRate} />
              {#each c.tags as name (name)}<Badge tone="info" class="shrink-0">{name}</Badge>{/each}
            </div>
          </Card>
          <Battlecard
            compact
            overview={c.overview}
            whyWeWin={c.whyWeWin}
            whyWeLose={c.whyWeLose}
            objections={c.objections}
            landmines={c.landmines}
            pricing={c.pricing}
            proofPoints={c.proofPoints}
          />
        </section>
      {/each}
    </div>
  </div>
{/if}
