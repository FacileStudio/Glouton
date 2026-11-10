<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Badge, Button, Card, EmptyState, Field, Icon, Input, Modal, PageHeader, Spinner, Tabs, icons, toast } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { useFormat, useT } from '$lib/i18n';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { STATUSES, STATUS_ICON, STATUS_TONE, type Application, type ApplicationStatus } from '$lib/components/job/job';

  const t = useT();
  const format = useFormat();
  const teamId = $derived(teamContextStore.getTeamId());

  let items = $state<Application[]>([]);
  let loading = $state(true);
  let filter = $state<ApplicationStatus | 'ALL'>('ALL');
  let addOpen = $state(false);
  let adding = $state(false);
  let draft = $state({ title: '', company: '', url: '' });

  const counts = $derived(Object.fromEntries(STATUSES.map((status) => [status, items.filter((item) => item.status === status).length])) as Record<ApplicationStatus, number>);
  const shown = $derived(filter === 'ALL' ? items : items.filter((item) => item.status === filter));
  const tabs = $derived([
    { id: 'ALL', label: t('job.applications.all'), badge: String(items.length) },
    ...STATUSES.map((status) => ({ id: status, label: t(`job.status.${status}`), badge: counts[status] > 0 ? String(counts[status]) : undefined })),
  ]);
  const now = Date.now();

  async function load() {
    try {
      items = await trpc.job.applications.query({ teamId });
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      loading = false;
    }
  }

  onMount(load);

  async function add(event: SubmitEvent) {
    event.preventDefault();
    adding = true;
    try {
      const created = await trpc.job.createApplication.mutate({
        teamId,
        application: { title: draft.title, company: draft.company || null, url: draft.url || null, links: draft.url ? [draft.url] : [] },
      });
      addOpen = false;
      draft = { title: '', company: '', url: '' };
      await goto(resolve('/app/job/applications/[id]', { id: created.id }));
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      adding = false;
    }
  }

  function when(item: Application): string {
    if (item.status === 'INTERVIEW' && item.interviewAt) return t('job.applications.interviewOn', { date: format.date(item.interviewAt) });
    if (item.status === 'APPLIED' && item.appliedAt) return t('job.applications.appliedOn', { date: format.date(item.appliedAt) });
    return t('job.applications.updated', { when: format.ago(item.updatedAt) });
  }
</script>

<PageHeader title={t('job.applications.title')} description={t('job.applications.description')}>
  {#snippet actions()}
    <Button icon={icons.plus} onclick={() => (addOpen = true)}>{t('job.applications.add')}</Button>
  {/snippet}
</PageHeader>

{#if loading}
  <Card class="flex items-center justify-center py-16"><Spinner size="lg" /></Card>
{:else if items.length === 0}
  <EmptyState icon="solar:checklist-minimalistic-linear" title={t('job.applications.empty')} description={t('job.applications.emptyText')}>
    <Button variant="secondary" icon="solar:magnifer-linear" href="/app/job/offers">{t('job.offers.open')}</Button>
  </EmptyState>
{:else}
  <div class="flex flex-col gap-4">
    <Tabs items={tabs} value={filter} onChange={(id: string) => (filter = id as ApplicationStatus | 'ALL')} label={t('job.applications.title')} />
    <ul class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {#each shown as item (item.id)}
        {@const due = item.remindAt && !item.remindedAt ? new Date(item.remindAt).getTime() <= now : false}
        <li>
          <a href={resolve('/app/job/applications/[id]', { id: item.id })} class="block h-full rounded-fc-lg bg-fc-component p-4 transition-colors hover:bg-fc-surface">
            <div class="flex flex-col gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONE[item.status]} class="shrink-0"><Icon icon={STATUS_ICON[item.status]} />{t(`job.status.${item.status}`)}</Badge>
                {#if item.remindAt}<Badge tone={due ? 'warning' : 'neutral'} class="shrink-0"><Icon icon="solar:bell-linear" />{format.date(item.remindAt)}</Badge>{/if}
              </div>
              <p class="text-fc-sm font-semibold text-fc-fg">{item.title}</p>
              {#if item.company || item.location}<p class="text-fc-xs text-fc-fg-muted">{[item.company, item.location].filter(Boolean).join(' · ')}</p>{/if}
              <p class="text-fc-xs text-fc-fg-muted">{when(item)}</p>
            </div>
          </a>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<Modal open={addOpen} title={t('job.applications.add')} onClose={() => (addOpen = false)}>
  <form id="add-application" class="flex flex-col gap-4" onsubmit={add}>
    <Field label={t('job.applications.jobTitle')} for="app-title"><Input id="app-title" bind:value={draft.title} required maxlength={300} /></Field>
    <Field label={t('job.applications.company')} for="app-company"><Input id="app-company" bind:value={draft.company} maxlength={200} /></Field>
    <Field label={t('job.applications.url')} for="app-url"><Input id="app-url" type="url" bind:value={draft.url} maxlength={1000} placeholder="https://" /></Field>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (addOpen = false)}>{t('common.cancel')}</Button>
    <Button type="submit" form="add-application" disabled={adding || !draft.title.trim()}>{t('common.add')}</Button>
  {/snippet}
</Modal>
