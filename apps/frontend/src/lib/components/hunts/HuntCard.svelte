<script lang="ts">
  import type { HuntFilters } from '$lib/websocket-events';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Badge, Button, Icon, IconButton, Spinner, icons, Tooltip } from '@facile/muse';
  import { useFormat, useT } from '$lib/i18n';

  const t = useT();
  const format = useFormat();

  interface HuntSession {
    id: string;
    huntType: 'DOMAIN' | 'LOCAL_BUSINESS' | undefined;
    sources?: string[];
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    totalLeads: number;
    successfulLeads: number;
    error: string | null;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    filters?: HuntFilters | null;
  }

  let {
    session,
    onCancel,
    onDelete,
    onRelaunch,
    cancelling = false,
    deleting = false,
    relaunching = false,
  }: {
    session: HuntSession;
    onCancel?: (id: string) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
    onRelaunch?: (id: string) => Promise<void>;
    cancelling?: boolean;
    deleting?: boolean;
    relaunching?: boolean;
  } = $props();

  const isCsvImport = $derived(
    session.sources?.includes('CSV_IMPORT') || false
  );

  const isLocal = $derived(
    session.huntType === 'LOCAL_BUSINESS' ||
    (!!(session.filters?.location) && !!(session.filters?.categories))
  );

  const huntTitle = $derived.by(() => {
    if (isCsvImport) {
      return t('hunts.csvImport');
    }
    if (isLocal) {
      const cat = session.filters?.categories?.[0] || t('hunts.localBusiness');
      const loc = session.filters?.location || '';
      return loc ? t('hunts.catAt', { category: cat, location: loc }) : cat;
    }
    const domain = session.filters?.domain;
    return domain || t('hunts.broadSearch');
  });

  const displayLeads = $derived(Math.max(session.successfulLeads || 0, session.totalLeads || 0));

  const statusLabel = $derived.by(() => {
    switch (session.status) {
      case 'COMPLETED': return t('hunts.status.completed');
      case 'FAILED': return t('hunts.status.failed');
      case 'PENDING': return t('hunts.status.pending');
      default: return session.status;
    }
  });

  const statusTone = $derived(session.status === 'FAILED' ? 'danger' : 'neutral');

  const successRate = $derived(
    session.totalLeads > 0 && session.successfulLeads > 0
      ? Math.round((session.successfulLeads / session.totalLeads) * 100)
      : 0
  );

  const referenceDate = $derived(session.completedAt || session.startedAt || session.createdAt);
</script>

<div
  role="button"
  tabindex="0"
  onclick={() => goto(resolve('/app/hunts/[id]', { id: session.id }))}
  onkeydown={(e) => e.key === 'Enter' && goto(resolve('/app/hunts/[id]', { id: session.id }))}
  class="group flex cursor-pointer flex-col gap-4 rounded-fc-md bg-fc-component p-5 transition-colors hover:bg-fc-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring"
>
  <div class="flex items-start gap-3">
    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
      <Tooltip text={huntTitle} describe={false} class="contents">
        <p class="truncate text-fc-sm font-semibold text-fc-fg">
          {huntTitle}
        </p>
      </Tooltip>
      <div class="flex flex-wrap items-center gap-2 text-fc-xs text-fc-fg-muted">
        <Badge tone={statusTone}>{statusLabel}</Badge>
        <span>{format.ago(referenceDate)}</span>
        <span>{isCsvImport ? t('hunts.kind.csv') : isLocal ? t('hunts.kind.local') : t('hunts.kind.domain')}</span>
      </div>
    </div>

    <div
      class="flex shrink-0 items-center gap-1"
      role="presentation"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      {#if session.status === 'PENDING' && onCancel}
        <Button
          variant="ghost-danger"
          size="sm"
          icon={cancelling ? undefined : icons.error}
          onclick={() => onCancel!(session.id)}
          disabled={cancelling}
        >
          {#if cancelling}
            <Spinner size="sm" label={t('hunts.cancelling')} />
            {t('hunts.cancelling')}
          {:else}
            {t('common.cancel')}
          {/if}
        </Button>
      {/if}

      {#if session.status === 'FAILED' && onRelaunch}
        <Tooltip text={t('hunts.relaunch')} class="contents">
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
        </Tooltip>
      {/if}

      {#if (session.status === 'COMPLETED' || session.status === 'FAILED') && onDelete}
        <IconButton
          variant="ghost-danger"
          onclick={() => onDelete!(session.id)}
          disabled={deleting}
          aria-label={t('hunts.delete')}
        >
          {#if deleting}
            <Spinner size="sm" label={t('hunts.deleting')} />
          {:else}
            <Icon icon="solar:trash-bin-trash-linear" />
          {/if}
        </IconButton>
      {/if}
    </div>
  </div>

  {#if session.status === 'FAILED' && session.error}
    <div class="rounded-fc-sm bg-fc-danger/10 px-3 py-2.5">
      <p class="line-clamp-2 overflow-hidden break-words text-fc-xs text-fc-danger">{session.error}</p>
    </div>
  {/if}

  <div class="flex items-center gap-4 pt-3">
    <div class="flex items-center gap-1.5">
      <Icon icon={icons.usersGroup} size={15} class="text-fc-fg-muted" />
      <span class="text-fc-sm font-medium text-fc-fg">{displayLeads}</span>
      <span class="hidden text-fc-sm text-fc-fg-muted sm:inline">{t('hunts.leadsLower')}</span>
    </div>

    {#if session.status === 'COMPLETED' && displayLeads > 0}
      <div class="flex items-center gap-1.5">
        <Icon icon={icons.dashboard} size={15} class="text-fc-fg-muted" />
        <span class="text-fc-sm font-medium text-fc-fg">{successRate}%</span>
        <span class="hidden text-fc-sm text-fc-fg-muted sm:inline">{t('hunts.successLower')}</span>
      </div>
    {/if}
  </div>
</div>
