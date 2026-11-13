<script lang="ts">
  import type { HuntFilters } from '$lib/websocket-events';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Badge, Button, Icon, Spinner, icons, Tooltip } from '@facile/muse';
  import { useFormat, useT } from '$lib/i18n';

  const t = useT();
  const format = useFormat();

  interface HuntSession {
    id: string;
    huntType: 'DOMAIN' | 'LOCAL_BUSINESS' | undefined;
    totalLeads: number;
    successfulLeads: number;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    filters?: HuntFilters | null;
  }

  let {
    session,
    onDelete,
    onRelaunch,
    deleting = false,
    relaunching = false,
  }: {
    session: HuntSession;
    onDelete?: (id: string) => Promise<void>;
    onRelaunch?: (id: string) => Promise<void>;
    deleting?: boolean;
    relaunching?: boolean;
  } = $props();

  function formatDuration(start: string | null, end: string | null): string {
    if (!start || !end) return '—';
    return format.duration(new Date(end).getTime() - new Date(start).getTime());
  }

  const isLocal = $derived(
    session.huntType === 'LOCAL_BUSINESS' ||
    (!!(session.filters?.location) && !!(session.filters?.categories))
  );

  const huntTitle = $derived.by(() => {
    if (isLocal) {
      const cat = session.filters?.categories?.[0] || t('hunts.localBusiness');
      const loc = session.filters?.location || '';
      return loc ? t('hunts.catAt', { category: cat, location: loc }) : cat;
    }
    const domain = session.filters?.domain;
    return domain || t('hunts.broadSearch');
  });

  const displayLeads = $derived(Math.max(session.successfulLeads || 0, session.totalLeads || 0));

  const successRate = $derived(
    session.totalLeads > 0 && session.successfulLeads > 0
      ? Math.round((session.successfulLeads / session.totalLeads) * 100)
      : 0
  );

  const referenceDate = $derived(session.completedAt || session.startedAt || session.createdAt);
</script>

<div class="flex flex-col overflow-hidden rounded-fc-md bg-fc-component">
  <button
    type="button"
    onclick={() => goto(resolve('/app/hunts/[id]', { id: session.id }))}
    class="group w-full p-5 text-left transition-colors hover:bg-fc-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fc-ring"
  >
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
      <div class="flex min-w-0 items-center gap-4 sm:flex-1">
        <div class="flex size-10 shrink-0 items-center justify-center rounded-fc-md bg-fc-surface text-fc-fg">
          <Icon icon={isLocal ? 'solar:map-point-linear' : icons.globe} size={20} />
        </div>

        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <div class="flex min-w-0 items-center gap-2">
            <h3 class="truncate text-fc-sm font-semibold text-fc-fg">{huntTitle}</h3>
            <Badge class="shrink-0">{t('hunts.status.completed')}</Badge>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-fc-xs text-fc-fg-muted">
            <span>{format.ago(referenceDate)}</span>
            {#if session.startedAt && session.completedAt}
              <span>·</span>
              <span>{t('hunts.duration', { duration: formatDuration(session.startedAt, session.completedAt) })}</span>
            {/if}
            <span>·</span>
            <span>{isLocal ? t('hunts.kind.local') : t('hunts.kind.domain')}</span>
          </div>
        </div>
      </div>

      <div class="flex shrink-0 items-center justify-between gap-6 pl-14 sm:justify-start sm:pl-0">
        <div class="flex items-center gap-4">
          <div class="text-right">
            <div class="flex items-center justify-end gap-1.5">
              <Icon icon={icons.usersGroup} size={14} class="text-fc-fg-muted" />
              <span class="text-fc-sm font-medium text-fc-fg">{displayLeads}</span>
            </div>
            <p class="hidden text-fc-xs text-fc-fg-muted sm:block">{t('hunts.leadsUpper')}</p>
          </div>

          {#if displayLeads > 0}
            <div class="text-right">
              <div class="flex items-center justify-end gap-1.5">
                <Icon icon={icons.dashboard} size={14} class="text-fc-fg-muted" />
                <span class="text-fc-sm font-medium text-fc-fg">{successRate}%</span>
              </div>
              <p class="hidden text-fc-xs text-fc-fg-muted sm:block">{t('hunts.successUpper')}</p>
            </div>
          {/if}
        </div>

        <Icon
          icon={icons.arrow}
          class="text-fc-fg-muted transition-transform group-hover:translate-x-0.5"
        />
      </div>
    </div>
  </button>

  <div
    class="flex items-center gap-2 px-5 py-3"
    role="presentation"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    {#if onRelaunch}
      <Button
        variant="secondary"
        size="sm"
        icon={relaunching ? undefined : 'solar:restart-linear'}
        onclick={() => onRelaunch!(session.id)}
        disabled={relaunching}
      >
        {#if relaunching}
          <Spinner size="sm" label={t('hunts.relaunching')} />
          {t('hunts.relaunching')}
        {:else}
          {t('hunts.relaunchShort')}
        {/if}
      </Button>
    {/if}

    <div class="flex-1"></div>

    {#if onDelete}
      <Tooltip text={t('hunts.delete')} class="contents">
        <Button
          variant="ghost-danger"
          size="sm"
          icon={deleting ? undefined : 'solar:trash-bin-trash-linear'}
          onclick={() => onDelete!(session.id)}
          disabled={deleting}
        >
          {#if deleting}
            <Spinner size="sm" label={t('hunts.deleting')} />
          {:else}
            {t('hunts.deleteShort')}
          {/if}
        </Button>
      </Tooltip>
    {/if}
  </div>
</div>
