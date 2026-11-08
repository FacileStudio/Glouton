<script lang="ts">
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, Textarea, toast } from '@facile/muse';
  import { QUIET } from '@repo/trpc-client';
  import { trpc } from '$lib/trpc';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { getErrorCode, getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { useT } from '$lib/i18n';
  import WinRateBadge from '$lib/components/competitors/WinRateBadge.svelte';
  import { splitList, type CompetitorItem } from '$lib/components/competitors/labels';
  import CompetitorTabs from '$lib/components/competitors/CompetitorTabs.svelte';

  const t = useT();
  const teamId = $derived(teamContextStore.getTeamId());

  let items = $state<CompetitorItem[]>([]);
  let tags = $state<string[]>([]);
  let q = $state('');
  let tag = $state('');
  let loading = $state(true);
  let unseen = $state<Record<string, number>>({});
  const selected = new SvelteSet<string>();

  let addOpen = $state(false);
  let finding = $state(false);
  let saving = $state(false);
  let form = $state(emptyForm());

  function emptyForm() {
    return { name: '', website: '', area: '', tags: '', overview: '' };
  }

  async function load() {
    loading = true;
    try {
      const res = await trpc.competitor.list.query({ teamId, q: q.trim() || undefined, tag: tag || undefined });
      items = res.items;
      tags = res.tags;
      unseen = await trpc.competitorWatch.unseenCounts.query({ teamId }, { context: QUIET }).catch(() => ({}));
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      loading = false;
    }
  }

  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  function onSearch(value: string) {
    q = value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 300);
  }

  function toggle(id: string, on: boolean) {
    if (on && selected.size >= 4) return;
    if (on) selected.add(id);
    else selected.delete(id);
  }

  async function add(event: SubmitEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.danger(t('competitors.nameRequired'));
      return;
    }
    saving = true;
    try {
      const created = await trpc.competitor.create.mutate({
        teamId,
        name: form.name,
        website: form.website || null,
        area: form.area || null,
        tags: splitList(form.tags),
        overview: form.overview || null,
      });
      toast.success(t('competitors.created'));
      addOpen = false;
      form = emptyForm();
      await goto(resolve('/app/competitors/[id]', { id: created.id }));
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      saving = false;
    }
  }

  async function findCompetitors() {
    finding = true;
    try {
      const res = await trpc.competitorDiscovery.run.mutate({ teamId });
      toast.success(res.queued ? t('discovery.queued') : t('discovery.alreadyRunning'));
      await goto(resolve('/app/competitors/suggestions'));
    } catch (error) {
      if (getErrorCode(error) === 'PRECONDITION_FAILED') await goto(resolve('/app/competitors/suggestions'));
      else toast.danger(getTrpcErrorMessage(error));
    } finally {
      finding = false;
    }
  }

  onMount(load);
</script>

<PageHeader title={t('competitors.title')} description={t('competitors.count', { count: items.length })}>
  {#snippet actions()}
    <form method="GET" action={resolve('/app/competitors/compare')}>
      <input type="hidden" name="ids" value={[...selected].join(',')} />
      <Button type="submit" variant="secondary" icon="solar:align-horizontal-center-linear" disabled={selected.size < 2}>
        {selected.size > 0 ? t('competitors.compareSelected', { count: selected.size }) : t('competitors.compare')}
      </Button>
    </form>
    <Button variant="secondary" icon="solar:magnifer-linear" onclick={findCompetitors} disabled={finding}>{t('discovery.find')}</Button>
    <Button icon="mdi:plus" onclick={() => (addOpen = true)}>{t('competitors.add')}</Button>
  {/snippet}
</PageHeader>

<div class="flex flex-col gap-4">
  <CompetitorTabs active="list" {teamId} />
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
    <Input
      type="search"
      class="sm:col-span-2"
      placeholder={t('competitors.searchPlaceholder')}
      aria-label={t('competitors.search')}
      value={q}
      oninput={(e) => onSearch(e.currentTarget.value)}
    />
    <Select aria-label={t('competitors.tag')} value={tag} onchange={(e) => { tag = e.currentTarget.value; load(); }}>
      <option value="">{t('competitors.allTags')}</option>
      {#each tags as name (name)}<option value={name}>{name}</option>{/each}
    </Select>
  </div>

  {#if items.length > 1}
    <p class="text-fc-xs text-fc-fg-muted">{t('competitors.compareHint')}</p>
  {/if}

  {#if loading}
    <Card class="flex items-center justify-center py-16"><Spinner size="lg" /></Card>
  {:else if items.length === 0}
    <EmptyState icon="solar:ranking-linear" title={q || tag ? t('competitors.noMatch') : t('competitors.none')}>
      {#if !q && !tag}<Button icon="mdi:plus" onclick={() => (addOpen = true)}>{t('competitors.add')}</Button>{/if}
    </EmptyState>
  {:else}
    <ul class="flex flex-col gap-2">
      {#each items as c (c.id)}
        <li class="flex min-h-11 items-center gap-3 rounded-fc-lg bg-fc-component p-4">
          <Checkbox
            dense
            aria-label={t('competitors.select', { name: c.name })}
            checked={selected.has(c.id)}
            disabled={!selected.has(c.id) && selected.size >= 4}
            onchange={(e) => toggle(c.id, e.currentTarget.checked)}
          />
          <a
            href={resolve('/app/competitors/[id]', { id: c.id })}
            class="flex min-w-0 flex-1 flex-col gap-2 rounded-fc-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0">
              <p class="truncate text-fc-sm font-semibold text-fc-fg hover:underline">{c.name}</p>
              <p class="truncate text-fc-xs text-fc-fg-muted">{[c.domain, c.area].filter(Boolean).join(' · ')}</p>
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              {#if c.status === 'ARCHIVED'}<Badge class="shrink-0">{t('competitors.status.ARCHIVED')}</Badge>{/if}
              {#each c.tags as name (name)}<Badge tone="info" class="shrink-0">{name}</Badge>{/each}
              {#if unseen[c.id]}
                <Badge tone="warning" class="shrink-0" aria-label={t('watch.badgeLabel', { count: unseen[c.id] })}>{t('watch.badge', { count: unseen[c.id] })}</Badge>
              {/if}
              <WinRateBadge rate={c.winRate} />
            </div>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<Modal open={addOpen} title={t('competitors.add')} onClose={() => (addOpen = false)}>
  <form id="add-competitor" class="flex flex-col gap-4" onsubmit={add}>
    <Field label={t('competitors.name')}><Input bind:value={form.name} required maxlength={200} /></Field>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label={t('competitors.website')}><Input bind:value={form.website} placeholder="rival.fr" maxlength={500} /></Field>
      <Field label={t('competitors.area')}><Input bind:value={form.area} maxlength={200} /></Field>
    </div>
    <Field label={t('competitors.tags')} helper={t('competitors.commaHint')}><Input bind:value={form.tags} /></Field>
    <Field label={t('competitors.section.overview')}><Textarea bind:value={form.overview} rows={3} /></Field>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (addOpen = false)}>{t('common.cancel')}</Button>
    <Button type="submit" form="add-competitor" disabled={saving}>
      {#if saving}<Spinner size="sm" />{/if}
      {t('common.add')}
    </Button>
  {/snippet}
</Modal>
