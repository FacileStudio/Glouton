<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Badge, Button, Spinner } from '@facile/muse';
  import { useFormat, useT } from '$lib/i18n';

  const t = useT();
  const format = useFormat();

  interface AuditSession {
    id: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    progress: number;
    totalLeads: number;
    processedLeads: number;
    updatedLeads: number;
    failedLeads: number;
    error: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }

  let {
    session,
    onCancel,
    cancelling = false,
  }: {
    session: AuditSession | null;
    onCancel: (id: string) => Promise<void>;
    cancelling: boolean;
  } = $props();

  let currentTime = $state(new Date());
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    timerInterval = setInterval(() => {
      currentTime = new Date();
    }, 1000);
  });

  onDestroy(() => {
    if (timerInterval) {
      clearInterval(timerInterval);
    }
  });

  function formatElapsedTime(startedAt: Date | null, current: Date = new Date()): string {
    if (!startedAt) return format.duration(0);

    const elapsedMs = current.getTime() - new Date(startedAt).getTime();
    return format.duration(elapsedMs, 3);
  }

  function calculateETA(audit: AuditSession, current: Date = new Date()): string {
    if (!audit.startedAt || audit.progress === 0) {
      return t('hunts.eta.computing');
    }

    const elapsedMs = current.getTime() - new Date(audit.startedAt).getTime();
    const progressPercentage = audit.progress / 100;

    if (progressPercentage === 0) {
      return t('hunts.eta.computing');
    }

    const estimatedTotalMs = elapsedMs / progressPercentage;
    const remainingMs = estimatedTotalMs - elapsedMs;

    if (remainingMs <= 0) {
      return t('hunts.eta.almost');
    }

    if (remainingMs < 60_000) {
      return t('hunts.eta.lessThanMinute');
    }

    return `~${format.duration(remainingMs)}`;
  }

  const elapsedTime = $derived(session ? formatElapsedTime(session.startedAt, currentTime) : '');
  const eta = $derived(session ? calculateETA(session, currentTime) : '');
</script>

{#if session}
  <div class="flex flex-col gap-5 rounded-fc-md bg-fc-component p-5" role="region">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div class="flex items-center gap-3 min-w-0">
        <div class="inline-flex size-9 shrink-0 items-center justify-center rounded-fc-md bg-fc-surface text-fc-fg">
          <iconify-icon icon="solar:shield-check-linear" width="18" height="18" class="block"></iconify-icon>
        </div>
        <div class="min-w-0">
          <h3 class="text-fc-lg font-semibold text-fc-fg">{t('audit.banner.title')}</h3>
          <div class="mt-1 flex flex-wrap items-center gap-2 text-fc-xs text-fc-fg-muted">
            <Badge>{session.status}</Badge>
            {#if session.processedLeads > 0}
              <span>
                {t('audit.banner.processing', { done: session.processedLeads, total: session.totalLeads })}
              </span>
            {/if}
            {#if session.updatedLeads > 0}
              <span class="inline-flex items-center gap-1">
                <iconify-icon icon="solar:check-circle-linear" width="12" height="12" class="block"></iconify-icon>
                {t('audit.banner.updated', { count: session.updatedLeads })}
              </span>
            {/if}
            {#if session.failedLeads > 0}
              <span class="inline-flex items-center gap-1 text-fc-danger">
                <iconify-icon icon="solar:danger-linear" width="12" height="12" class="block"></iconify-icon>
                {t('audit.banner.failed', { count: session.failedLeads })}
              </span>
            {/if}
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between gap-4 sm:shrink-0 sm:justify-start">
        <div class="text-left text-fc-xs text-fc-fg-muted sm:text-right">
          <div>{t('hunts.banner.elapsed')} <span class="font-medium text-fc-fg">{elapsedTime}</span></div>
          <div>{t('hunts.banner.eta')} <span class="font-medium text-fc-fg">{eta}</span></div>
        </div>
        <Button
          variant="ghost-danger"
          icon={cancelling ? undefined : 'solar:close-circle-linear'}
          onclick={(e) => {
            e.stopPropagation();
            if (session) onCancel(session.id);
          }}
          disabled={cancelling}
        >
          {#if cancelling}
            <Spinner size="sm" />
            {t('hunts.cancellingDots')}
          {:else}
            {t('common.cancel')}
          {/if}
        </Button>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <div class="flex justify-between text-fc-xs text-fc-fg-muted">
        <span>{t('hunts.progress')}</span>
        <span class="font-medium text-fc-fg">{session.progress}%</span>
      </div>
      <div class="h-1.5 overflow-hidden rounded-fc-pill bg-fc-surface">
        <div
          class="h-full bg-fc-accent transition-all duration-500 ease-fc"
          style="width: {session.progress}%"
        ></div>
      </div>
    </div>
  </div>
{/if}
