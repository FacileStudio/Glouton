<script lang="ts">
  import { QUIET } from '@repo/trpc-client';
  import { onDestroy, onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import type { RouterOutputs } from '@repo/trpc-client';
  import {
    Alert,
    Badge,
    Button,
    Card,
    ConfirmModal,
    EmptyState,
    PageHeader,
    PlanLimit,
    Select,
    Spinner,
    StatusDot,
    toast,
    type PlanLimitError,
  } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { ws } from '$lib/websocket';
  import { getErrorMessage } from '$lib/utils/trpc-error';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { useFormat, useT } from '$lib/i18n';
  import { categoryLabel, limitFrom, type Frequency } from '$lib/components/schedules/labels';
  import SegmentSuggestions from '$lib/components/schedules/SegmentSuggestions.svelte';

  type Schedule = RouterOutputs['huntSchedule']['list'][number];

  const t = useT();
  const format = useFormat();
  const teamId = $derived(teamContextStore.getTeamId());

  let items = $state<Schedule[]>([]);
  let loading = $state(true);
  let busyId = $state<string | null>(null);
  let removing = $state<Schedule | null>(null);
  let limit = $state<PlanLimitError | null>(null);

  const offs = [
    ws.on('hunt-digest', () => void load()),
    ws.on('hunt-schedule-paused', () => void load()),
    ws.on('hunt-completed', () => void load()),
    ws.on('hunt-failed', () => void load()),
  ];
  onDestroy(() => offs.forEach((off) => off()));

  async function load() {
    try {
      items = await trpc.huntSchedule.list.query({ teamId });
    } catch (error) {
      toast.danger(getErrorMessage(error, t('schedules.loadFailed')));
    } finally {
      loading = false;
    }
  }

  onMount(load);

  function categories(schedule: Schedule): string {
    return (schedule.filters?.categories ?? []).map((c) => {
      const key = categoryLabel(c);
      return key ? t(key) : c;
    }).join(', ');
  }

  function running(schedule: Schedule): boolean {
    return schedule.lastRun?.status === 'PENDING' || schedule.lastRun?.status === 'PROCESSING';
  }

  async function act(schedule: Schedule, action: 'pause' | 'resume' | 'runNow', done: Parameters<typeof t>[0]) {
    busyId = schedule.id;
    try {
      if (action === 'runNow') {
        const { huntSessionId } = await trpc.huntSchedule.runNow.mutate({ scheduleId: schedule.id });
        toast.success(t(done));
        await goto(resolve('/app/hunts/[id]', { id: huntSessionId }));
        return;
      }
      await trpc.huntSchedule[action].mutate({ scheduleId: schedule.id }, { context: QUIET });
      toast.success(t(done));
      await load();
    } catch (error) {
      limit = limitFrom(error);
      if (!limit) toast.danger(getErrorMessage(error, t('schedules.actionFailed')));
    } finally {
      busyId = null;
    }
  }

  async function changeFrequency(schedule: Schedule, frequency: Frequency) {
    busyId = schedule.id;
    try {
      await trpc.huntSchedule.update.mutate({ scheduleId: schedule.id, frequency });
      await load();
    } catch (error) {
      toast.danger(getErrorMessage(error, t('schedules.actionFailed')));
    } finally {
      busyId = null;
    }
  }

  async function remove() {
    if (!removing) return;
    const id = removing.id;
    try {
      await trpc.huntSchedule.delete.mutate({ scheduleId: id });
      toast.success(t('schedules.deletedToast'));
      items = items.filter((item) => item.id !== id);
    } catch (error) {
      toast.danger(getErrorMessage(error, t('schedules.actionFailed')));
    } finally {
      removing = null;
    }
  }

</script>

<div class="flex flex-col gap-6">
  <PageHeader title={t('schedules.title')} description={t('schedules.subtitle')} back={{ href: '/app/hunts', label: t('hunts.backToHunts') }}>
    {#snippet actions()}
      <Button variant="ghost" icon="solar:user-id-linear" href="/app/settings/prospecting">{t('schedules.profileLink')}</Button>
      <Button icon="solar:map-point-linear" href="/app/hunts/new">{t('hunts.new')}</Button>
    {/snippet}
  </PageHeader>

  <PlanLimit error={limit} />

  {#if loading}
    <div class="flex items-center justify-center py-16" in:fade>
      <Spinner size="lg" label={t('common.loading')} />
    </div>
  {:else if items.length === 0}
    <EmptyState icon="solar:refresh-circle-linear" title={t('schedules.empty.title')} description={t('schedules.empty.text')}>
      <Button href="/app/settings/prospecting" variant="secondary">{t('schedules.profileLink')}</Button>
    </EmptyState>
  {:else}
    <ul class="flex flex-col gap-3" aria-label={t('schedules.title')}>
      {#each items as schedule (schedule.id)}
        <li in:fade>
          <Card class="flex flex-col gap-3">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="flex min-w-0 flex-col gap-1">
                <p class="truncate font-semibold text-fc-fg">{schedule.name}</p>
                <p class="text-fc-sm text-fc-fg-muted">{categories(schedule)}{schedule.name === schedule.filters?.location ? '' : ` · ${schedule.filters?.location}`}</p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                {#if running(schedule)}
                  <Badge tone="info"><StatusDot tone="info" pulse />{t('schedules.status.running')}</Badge>
                {/if}
                {#if schedule.enabled}
                  <Badge tone="success">{t('schedules.status.active')}</Badge>
                {:else if schedule.pausedReason === 'failures'}
                  <Badge tone="danger">{t('schedules.status.autoPaused')}</Badge>
                {:else}
                  <Badge>{t('schedules.status.paused')}</Badge>
                {/if}
              </div>
            </div>

            {#if !schedule.enabled && schedule.pausedReason === 'failures'}
              <Alert tone="danger">{t('schedules.autoPausedText')}</Alert>
            {/if}

            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-fc-sm text-fc-fg-muted">
              {#if schedule.lastRun}
                <a class="text-fc-fg underline-offset-2 hover:underline" href={resolve('/app/hunts/[id]', { id: schedule.lastRun.id })}>
                  {t('schedules.last', { ago: format.ago(schedule.lastRun.createdAt) })}
                </a>
                {#if schedule.lastNewLeads !== null}
                  <span>{t('schedules.newLeads', { count: schedule.lastNewLeads })}</span>
                {/if}
              {:else}
                <span>{t('schedules.never')}</span>
              {/if}
              {#if schedule.enabled}
                <span>{t('schedules.next', { date: format.dateTime(schedule.nextRunAt) })}</span>
              {/if}
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <Select
                class="w-auto"
                aria-label={t('schedules.frequency')}
                value={schedule.frequency}
                disabled={busyId === schedule.id}
                onchange={(e) => changeFrequency(schedule, e.currentTarget.value as Frequency)}
              >
                <option value="DAILY">{t('schedules.freq.DAILY')}</option>
                <option value="WEEKLY">{t('schedules.freq.WEEKLY')}</option>
                <option value="MONTHLY">{t('schedules.freq.MONTHLY')}</option>
              </Select>
              {#if schedule.enabled}
                <Button size="sm" variant="secondary" icon="solar:pause-linear" disabled={busyId === schedule.id} onclick={() => act(schedule, 'pause', 'schedules.pausedToast')}>{t('schedules.pause')}</Button>
              {:else}
                <Button size="sm" variant="secondary" icon="solar:play-linear" disabled={busyId === schedule.id} onclick={() => act(schedule, 'resume', 'schedules.resumedToast')}>{t('schedules.resume')}</Button>
              {/if}
              <Button size="sm" variant="ghost" icon="solar:bolt-linear" disabled={busyId === schedule.id || running(schedule)} onclick={() => act(schedule, 'runNow', 'schedules.startedToast')}>{t('schedules.runNow')}</Button>
              <Button size="sm" variant="ghost-danger" icon="solar:trash-bin-trash-linear" disabled={busyId === schedule.id} onclick={() => (removing = schedule)}>{t('schedules.delete')}</Button>
            </div>
          </Card>
        </li>
      {/each}
    </ul>
  {/if}

  <SegmentSuggestions {teamId} onAdded={load} onLimit={(refused) => (limit = refused)} />
</div>

<ConfirmModal
  open={removing !== null}
  title={t('schedules.deleteTitle')}
  description={t('schedules.deleteText')}
  confirmLabel={t('schedules.delete')}
  cancelLabel={t('common.cancel')}
  tone="danger"
  onConfirm={remove}
  onCancel={() => (removing = null)}
/>
