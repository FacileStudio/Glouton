<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { Badge, Button, Card, Spinner, toast } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { useFormat, useT } from '$lib/i18n';
  import { percentOf, shortUrl, type PageChange } from './watch';

  interface Props {
    competitorId: string;
    teamId?: string;
    onSeen?: () => void;
  }

  let { competitorId, teamId, onSeen }: Props = $props();

  const t = useT();
  const format = useFormat();

  let changes = $state<PageChange[]>([]);
  let loading = $state(true);
  const open = new SvelteSet<string>();

  const unseen = $derived(changes.filter((change) => !change.seen).length);

  export async function load() {
    try {
      changes = await trpc.competitorWatch.changes.query({ competitorId, teamId });
      const first = changes[0];
      if (first && open.size === 0) open.add(first.id);
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      loading = false;
    }
  }

  async function markSeen(changeIds?: string[]) {
    try {
      await trpc.competitorWatch.markSeen.mutate({ competitorId, teamId, changeIds });
      changes = changes.map((change) => (!changeIds || changeIds.includes(change.id) ? { ...change, seen: true } : change));
      onSeen?.();
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    }
  }

  function toggle(id: string) {
    if (open.has(id)) open.delete(id);
    else open.add(id);
  }

  onMount(load);
</script>

<Card class="flex flex-col gap-4">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h3 class="text-fc-md font-semibold text-fc-fg">{t('watch.timeline')}</h3>
    {#if unseen > 0}
      <Button variant="ghost" size="sm" icon="solar:check-read-linear" onclick={() => markSeen()}>{t('watch.markAllSeen')}</Button>
    {/if}
  </div>

  {#if loading}
    <div class="flex justify-center py-6"><Spinner /></div>
  {:else if changes.length === 0}
    <p class="text-fc-sm text-fc-fg-muted">{t('watch.noChanges')}</p>
  {:else}
    <ol class="flex flex-col gap-3">
      {#each changes as change (change.id)}
        <li class="flex flex-col gap-2 rounded-fc-md bg-fc-surface p-3">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex min-w-0 flex-col gap-1">
              <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                {#if !change.seen}<Badge tone="info" class="shrink-0">{t('watch.new')}</Badge>{/if}
                <Badge class="shrink-0">{t(`watch.kind.${change.page.kind}`)}</Badge>
                <span class="min-w-0 truncate text-fc-sm font-medium text-fc-fg">{shortUrl(change.page.url)}</span>
              </div>
              <p class="text-fc-xs text-fc-fg-muted">
                <time datetime={new Date(change.createdAt).toISOString()}>{format.dateTime(change.createdAt)}</time>
                · {t('watch.changedShare', { percent: percentOf(change.changeRatio) })}
                · {t('watch.lines', { added: change.addedLines, removed: change.removedLines })}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="sm" aria-expanded={open.has(change.id)} onclick={() => toggle(change.id)}>
                {open.has(change.id) ? t('watch.hideDiff') : t('watch.showDiff')}
              </Button>
              {#if !change.seen}
                <Button variant="ghost" size="sm" onclick={() => markSeen([change.id])}>{t('watch.markSeen')}</Button>
              {/if}
            </div>
          </div>
          {#if open.has(change.id)}
            <ol class="flex max-h-96 flex-col gap-0.5 overflow-auto rounded-fc-md bg-fc-component p-2 font-mono text-fc-xs">
              {#each change.diff as line, index (index)}
                <li
                  class="flex gap-2 rounded-fc-sm px-2 py-0.5 break-words whitespace-pre-wrap {line.op === '+'
                    ? 'bg-fc-success/10 text-fc-fg'
                    : line.op === '-'
                      ? 'bg-fc-danger/10 text-fc-fg-muted line-through'
                      : 'text-fc-fg-muted'}"
                >
                  <span aria-hidden="true" class="w-3 shrink-0 select-none">{line.op === '+' ? '+' : line.op === '-' ? '−' : ' '}</span>
                  {#if line.op === '+'}<span class="sr-only">{t('watch.lineAdded')}:</span>{/if}
                  {#if line.op === '-'}<span class="sr-only">{t('watch.lineRemoved')}:</span>{/if}
                  <span class="min-w-0">{line.text}</span>
                </li>
              {/each}
            </ol>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
</Card>
