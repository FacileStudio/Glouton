<script lang="ts">
  import { onMount } from 'svelte';
  import { Badge, Button, Card, ConfirmModal, Field, Icon, IconButton, Input, Modal, PlanLimit, Select, Spinner, Switch, toast, type PlanLimitError } from '@facile/muse';
  import { QUIET } from '@repo/trpc-client';
  import { trpc } from '$lib/trpc';
  import { getErrorCode, getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { useFormat, useT } from '$lib/i18n';
  import { PAGE_KINDS, checkStatus, planLimitOf, shortUrl, suggestions, type PageKind, type PageList, type WatchedPage } from './watch';

  interface Props {
    competitorId: string;
    teamId?: string;
    domain: string | null;
    onChanged?: () => void;
  }

  let { competitorId, teamId, domain, onChanged }: Props = $props();

  const t = useT();
  const format = useFormat();

  let list = $state<PageList | null>(null);
  let loading = $state(true);
  let formOpen = $state(false);
  let editing = $state<WatchedPage | null>(null);
  let saving = $state(false);
  let removing = $state<WatchedPage | null>(null);
  let confirmOpen = $state(false);
  let limit = $state<PlanLimitError | null>(null);
  let form = $state(emptyForm());

  const pages = $derived(list?.pages ?? []);
  const usual = $derived(suggestions(domain, pages.map((page) => page.url)));
  const usage = $derived.by(() => {
    if (!list) return '';
    const { used, limit: max } = list.usage;
    return max === null || max === -1 ? t('watch.usageCount', { count: used }) : t('watch.usage', { used, limit: max });
  });

  function emptyForm(url = '', kind: PageKind = 'PRICING') {
    return { url, kind, selector: '', thresholdPct: 5, enabled: true };
  }

  async function load() {
    try {
      list = await trpc.competitorWatch.pages.query({ competitorId, teamId });
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      loading = false;
    }
  }

  function openAdd(url = '', kind: PageKind = 'PRICING') {
    editing = null;
    form = emptyForm(url, kind);
    formOpen = true;
  }

  function openEdit(page: WatchedPage) {
    editing = page;
    form = { url: page.url, kind: page.kind, selector: page.selector ?? '', thresholdPct: page.thresholdPct, enabled: page.enabled };
    formOpen = true;
  }

  function explain(error: unknown) {
    const refused = planLimitOf(error);
    if (refused) {
      limit = { ...refused, message: t('watch.limitReached', { limit: refused.limit ?? '' }) };
      formOpen = false;
      return;
    }
    const code = getErrorCode(error);
    if (code === 'CONFLICT') toast.danger(t('watch.duplicate'));
    else if (code === 'BAD_REQUEST') toast.danger(t('watch.invalidUrl'));
    else toast.danger(getTrpcErrorMessage(error));
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!form.url.trim()) {
      toast.danger(t('watch.urlRequired'));
      return;
    }
    saving = true;
    const fields = {
      url: form.url,
      kind: form.kind,
      selector: form.selector.trim() || null,
      thresholdPct: Math.min(100, Math.max(1, Math.round(Number(form.thresholdPct) || 5))),
      enabled: form.enabled,
    };
    try {
      if (editing) {
        await trpc.competitorWatch.updatePage.mutate({ competitorId, teamId, pageId: editing.id, ...fields });
        toast.success(t('watch.saved'));
      } else {
        await trpc.competitorWatch.addPage.mutate({ competitorId, teamId, ...fields }, { context: QUIET });
        toast.success(t('watch.added'));
      }
      formOpen = false;
      await load();
    } catch (error) {
      explain(error);
    } finally {
      saving = false;
    }
  }

  async function toggle(page: WatchedPage, enabled: boolean) {
    try {
      await trpc.competitorWatch.updatePage.mutate({ competitorId, teamId, pageId: page.id, enabled });
      await load();
    } catch (error) {
      explain(error);
    }
  }

  function askRemove(page: WatchedPage) {
    removing = page;
    confirmOpen = true;
  }

  async function remove() {
    if (!removing) return;
    try {
      await trpc.competitorWatch.deletePage.mutate({ competitorId, teamId, pageId: removing.id });
      toast.success(t('watch.removed'));
      limit = null;
      await load();
      onChanged?.();
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    }
  }

  function statusLine(page: WatchedPage): string {
    const status = t(`watch.status.${checkStatus(page.lastStatus)}`);
    return page.lastCheckedAt ? `${status} · ${t('watch.lastChecked', { date: format.ago(page.lastCheckedAt) })}` : status;
  }

  onMount(load);
</script>

<Card class="flex flex-col gap-4">
  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div class="flex min-w-0 flex-col gap-1">
      <h3 class="text-fc-md font-semibold text-fc-fg">{t('watch.title')}</h3>
      <p class="text-fc-sm text-fc-fg-muted">{t('watch.description')}</p>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      {#if usage}<span class="text-fc-xs whitespace-nowrap text-fc-fg-muted">{usage}</span>{/if}
      <Button size="sm" icon="mdi:plus" onclick={() => openAdd()}>{t('watch.add')}</Button>
    </div>
  </div>

  <PlanLimit error={limit} />

  {#if loading}
    <div class="flex justify-center py-6"><Spinner /></div>
  {:else}
    {#if pages.length === 0}
      <p class="text-fc-sm text-fc-fg-muted">{t('watch.none')}</p>
    {:else}
      <ul class="flex flex-col gap-2">
        {#each pages as page (page.id)}
          <li class="flex flex-col gap-3 rounded-fc-md bg-fc-surface p-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex min-w-0 flex-col gap-1">
              <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                <Badge class="shrink-0">{t(`watch.kind.${page.kind}`)}</Badge>
                {#if !page.enabled}<Badge tone="warning" class="shrink-0">{t('watch.paused')}</Badge>{/if}
                {#if page.unseen > 0}<Badge tone="info" class="shrink-0">{t('watch.unseen', { count: page.unseen })}</Badge>{/if}
                <Button
                  variant="ghost"
                  size="sm"
                  class="min-w-0 max-w-full"
                  iconRight="solar:arrow-right-up-linear"
                  href={page.url}
                  target="_blank"
                  rel="noopener noreferrer"
                ><span class="truncate">{shortUrl(page.url)}</span></Button>
              </div>
              <p class="truncate text-fc-xs text-fc-fg-muted">
                {statusLine(page)}{#if page.selector} · <code>{page.selector}</code>{/if} · {page.thresholdPct} %
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <Switch dense label={t('watch.enabled')} checked={page.enabled} onchange={(e) => toggle(page, e.currentTarget.checked)} />
              <IconButton variant="ghost" aria-label={t('watch.edit')} onclick={() => openEdit(page)}><Icon icon="solar:pen-linear" /></IconButton>
              <IconButton variant="ghost" aria-label={t('watch.remove')} onclick={() => askRemove(page)}><Icon icon="solar:trash-bin-minimalistic-linear" /></IconButton>
            </div>
          </li>
        {/each}
      </ul>
    {/if}

    {#if usual.length > 0}
      <div class="flex flex-col gap-2">
        <p class="text-fc-xs font-medium text-fc-fg-muted">{t('watch.suggestions')}</p>
        <div class="flex flex-wrap gap-1.5">
          {#each usual as entry (entry.url)}
            <Button variant="secondary" size="sm" icon="mdi:plus" onclick={() => openAdd(entry.url, entry.kind)} aria-label={t('watch.suggestAdd', { path: entry.path })}>
              {entry.path}
            </Button>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</Card>

<Modal open={formOpen} title={editing ? t('watch.editTitle') : t('watch.add')} onClose={() => (formOpen = false)}>
  <form id="watch-page" class="flex flex-col gap-4" onsubmit={save}>
    <Field label={t('watch.url')}>
      <Input bind:value={form.url} required maxlength={2000} placeholder={domain ? `${domain}/tarifs` : 'rival.fr/tarifs'} inputmode="url" />
    </Field>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label={t('watch.kind')}>
        <Select bind:value={form.kind}>
          {#each PAGE_KINDS as kind (kind)}<option value={kind}>{t(`watch.kind.${kind}`)}</option>{/each}
        </Select>
      </Field>
      <Field label={t('watch.threshold')} helper={t('watch.thresholdHint')}>
        <Input type="number" min={1} max={100} step={1} bind:value={form.thresholdPct} />
      </Field>
    </div>
    <Field label={t('watch.selector')} helper={t('watch.selectorHint')}>
      <Input bind:value={form.selector} maxlength={200} placeholder="#pricing" />
    </Field>
    <Switch label={t('watch.enabled')} bind:checked={form.enabled} />
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (formOpen = false)}>{t('common.cancel')}</Button>
    <Button type="submit" form="watch-page" disabled={saving}>
      {#if saving}<Spinner size="sm" />{/if}
      {editing ? t('common.save') : t('common.add')}
    </Button>
  {/snippet}
</Modal>

<ConfirmModal
  bind:open={confirmOpen}
  title={t('watch.removeTitle')}
  description={t('watch.removeBody')}
  confirmLabel={t('watch.remove')}
  cancelLabel={t('common.cancel')}
  tone="danger"
  onConfirm={remove}
/>
