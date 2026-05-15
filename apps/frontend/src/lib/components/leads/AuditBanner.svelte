<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import 'iconify-icon';

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
    clickable = false,
  }: {
    session: AuditSession | null;
    onCancel: (id: string) => Promise<void>;
    cancelling: boolean;
    clickable?: boolean;
  } = $props();

  function handleClick() {
    if (clickable && session) {
      goto(`/app/audits/${session.id}`);
    }
  }

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
    if (!startedAt) return '0s';

    const elapsedMs = current.getTime() - new Date(startedAt).getTime();
    const seconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  function calculateETA(audit: AuditSession, current: Date = new Date()): string {
    if (!audit.startedAt || audit.progress === 0) {
      return 'Calcul en cours...';
    }

    const elapsedMs = current.getTime() - new Date(audit.startedAt).getTime();
    const progressPercentage = audit.progress / 100;

    if (progressPercentage === 0) {
      return 'Calcul en cours...';
    }

    const estimatedTotalMs = elapsedMs / progressPercentage;
    const remainingMs = estimatedTotalMs - elapsedMs;

    if (remainingMs <= 0) {
      return 'Presque terminé';
    }

    const remainingSeconds = Math.floor(remainingMs / 1000);
    const remainingMinutes = Math.floor(remainingSeconds / 60);
    const remainingHours = Math.floor(remainingMinutes / 60);

    if (remainingHours > 0) {
      return `~${remainingHours}h ${remainingMinutes % 60}m`;
    } else if (remainingMinutes > 0) {
      return `~${remainingMinutes}m`;
    } else {
      return 'Moins d\'1 min';
    }
  }

  const elapsedTime = $derived(session ? formatElapsedTime(session.startedAt, currentTime) : '');
  const eta = $derived(session ? calculateETA(session, currentTime) : '');
</script>

{#if session}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="rounded-xl border border-border bg-card p-6 transition-colors {clickable ? 'cursor-pointer hover:bg-muted/40' : ''}"
    role={clickable ? 'button' : 'region'}
    tabindex={clickable ? 0 : -1}
    onclick={handleClick}
    onkeydown={(e) => clickable && e.key === 'Enter' && handleClick()}
  >
    <div class="flex items-start justify-between gap-4 mb-5">
      <div class="flex items-center gap-3 min-w-0">
        <div class="inline-flex size-9 items-center justify-center rounded-lg bg-muted text-foreground flex-shrink-0">
          <iconify-icon icon="solar:shield-check-linear" width="18"></iconify-icon>
        </div>
        <div class="min-w-0">
          <h3 class="text-lg font-semibold text-foreground">Audit en cours</h3>
          <div class="flex items-center gap-2 mt-1 flex-wrap text-xs text-muted-foreground">
            <span class="rounded-full bg-muted px-2.5 py-0.5 font-medium text-foreground">
              {session.status}
            </span>
            {#if session.processedLeads > 0}
              <span>
                Traitement {session.processedLeads} / {session.totalLeads} leads
              </span>
            {/if}
            {#if session.updatedLeads > 0}
              <span class="inline-flex items-center gap-1">
                <iconify-icon icon="solar:check-circle-linear" width="12"></iconify-icon>
                {session.updatedLeads} mis à jour
              </span>
            {/if}
            {#if session.failedLeads > 0}
              <span class="inline-flex items-center gap-1 text-destructive">
                <iconify-icon icon="solar:danger-linear" width="12"></iconify-icon>
                {session.failedLeads} échoués
              </span>
            {/if}
          </div>
        </div>
      </div>

      <div class="flex items-center gap-4 flex-shrink-0">
        <div class="text-right text-xs text-muted-foreground">
          <div>En cours : <span class="text-foreground font-medium">{elapsedTime}</span></div>
          <div>ETA : <span class="text-foreground font-medium">{eta}</span></div>
        </div>
        <button
          onclick={(e) => {
            e.stopPropagation();
            if (session) onCancel(session.id);
          }}
          disabled={cancelling}
          class="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {#if cancelling}
            <iconify-icon icon="solar:close-circle-linear" width="16" class="animate-spin"></iconify-icon>
            Annulation...
          {:else}
            <iconify-icon icon="solar:close-circle-linear" width="16"></iconify-icon>
            Annuler
          {/if}
        </button>
      </div>
    </div>

    <div class="space-y-2">
      <div class="flex justify-between text-xs text-muted-foreground">
        <span>Progression</span>
        <span class="font-medium text-foreground">{session.progress}%</span>
      </div>
      <div class="bg-muted rounded-full h-1.5 overflow-hidden">
        <div
          class="bg-foreground h-full transition-all duration-500 ease-out"
          style="width: {session.progress}%"
        ></div>
      </div>
    </div>
  </div>
{/if}
