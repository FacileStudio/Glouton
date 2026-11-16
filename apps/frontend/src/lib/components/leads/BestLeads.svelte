<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { Card, Spinner } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { useT } from '$lib/i18n';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import FitPill from './FitPill.svelte';
  import { reasonText, topReasons, type FitItem } from './fit';

  const t = useT();
  const teamId = $derived(teamContextStore.getTeamId());

  let items = $state<FitItem[]>([]);
  let loading = $state(true);
  let failed = $state(false);

  onMount(async () => {
    try {
      items = (await trpc.leadScore.list.query({ teamId, limit: 5 })).items;
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  });
</script>

<Card class="flex flex-col gap-3" aria-labelledby="best-leads-title">
  <div class="flex flex-col gap-1">
    <h2 id="best-leads-title" class="flex items-center gap-2 text-fc-md font-semibold text-fc-fg">
      <iconify-icon icon="solar:star-shine-linear" width="18" height="18" class="block shrink-0"></iconify-icon>
      {t('fit.best.title')}
    </h2>
    <p class="max-w-prose text-fc-sm text-fc-fg-muted">{t('fit.best.text')}</p>
  </div>
  {#if loading}
    <div class="flex justify-center py-4"><Spinner /></div>
  {:else if failed}
    <p class="text-fc-sm text-fc-fg-muted">{t('fit.loadFailed')}</p>
  {:else if items.length === 0}
    <p class="text-fc-sm text-fc-fg-muted">{t('fit.best.none')}</p>
  {:else}
    <ul class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
      {#each items as item (item.leadId)}
        <li>
          <a
            href={resolve('/app/leads/[id]', { id: item.leadId })}
            class="flex min-h-11 flex-col gap-1.5 rounded-fc-md bg-fc-surface p-3 transition-colors hover:bg-fc-component focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring"
          >
            <span class="flex items-center justify-between gap-2">
              <span class="min-w-0 truncate text-fc-sm font-medium text-fc-fg">{item.businessName || item.domain || '-'}</span>
              <FitPill fit={item} />
            </span>
            <span class="flex flex-col gap-0.5 text-fc-xs text-fc-fg-muted">
              {#each topReasons(item.reasons, 2) as reason (reason.factor)}
                <span class="min-w-0 wrap-anywhere">{reasonText(t, reason)}</span>
              {/each}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</Card>
