<script lang="ts">
  import { goto } from '$app/navigation';
  import 'iconify-icon';

  interface HuntSession {
    id: string;
    huntType: 'DOMAIN' | 'LOCAL_BUSINESS' | undefined;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    progress: number;
    totalLeads: number;
    successfulLeads: number;
    failedLeads: number;
    error: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    filters?: any;
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

  function formatTimeAgo(date: Date): string {
    const mins = Math.floor((new Date().getTime() - new Date(date).getTime()) / 60000);
    if (mins < 2) return "À l'instant";
    if (mins < 60) return `Il y a ${mins}min`;
    if (mins < 1440) return `Il y a ${Math.floor(mins / 60)}h`;
    return `Il y a ${Math.floor(mins / 1440)}j`;
  }

  function formatDuration(start: Date | null, end: Date | null): string {
    if (!start || !end) return '—';
    const duration = new Date(end).getTime() - new Date(start).getTime();
    const seconds = Math.floor(duration / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}min`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
  }

  const isLocal = $derived(
    session.huntType === 'LOCAL_BUSINESS' ||
    (!!(session.filters?.location) && !!(session.filters?.categories))
  );

  const huntTitle = $derived.by(() => {
    if (isLocal) {
      const cat = session.filters?.categories?.[0] || session.filters?.category || 'Commerce local';
      const loc = session.filters?.location || '';
      return loc ? `${cat} à ${loc}` : cat;
    }
    const domain = session.filters?.domain;
    return domain || 'Recherche large';
  });

  const displayLeads = $derived(Math.max(session.successfulLeads || 0, session.totalLeads || 0));

  const successRate = $derived(
    session.totalLeads > 0 && session.successfulLeads > 0
      ? Math.round((session.successfulLeads / session.totalLeads) * 100)
      : 0
  );

  const successRateCls = $derived(
    successRate >= 70 ? 'text-green-600' : successRate >= 40 ? 'text-yellow-600' : 'text-red-500'
  );

  const referenceDate = $derived(session.completedAt || session.startedAt || session.createdAt);
</script>

<div
  class="group relative rounded-2xl bg-white shadow-md hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-200 overflow-hidden border border-neutral-100 hover:border-neutral-200"
>
  <button
    onclick={() => goto(`/app/hunts/${session.id}`)}
    class="w-full p-5 text-left hover:bg-neutral-50/50 transition-colors duration-200"
  >
    <div class="flex items-center gap-4">
      <div class="flex items-center justify-center w-12 h-12 rounded-xl bg-green-50 flex-shrink-0">
        <iconify-icon
          icon={isLocal ? 'solar:map-point-bold-duotone' : 'solar:global-bold-duotone'}
          width="24"
          class="text-green-600"
        ></iconify-icon>
      </div>

      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <h3 class="font-black text-base text-neutral-900 truncate">{huntTitle}</h3>
          <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide bg-green-100 text-green-700 flex-shrink-0">
            Terminée
          </span>
        </div>
        <div class="flex items-center gap-3 text-xs text-neutral-500">
          <span class="font-bold">{formatTimeAgo(referenceDate)}</span>
          {#if session.startedAt && session.completedAt}
            <span>•</span>
            <span class="font-medium">Durée: {formatDuration(session.startedAt, session.completedAt)}</span>
          {/if}
          <span>•</span>
          <span class="font-bold uppercase tracking-wide">{isLocal ? 'Local' : 'Domaine'}</span>
        </div>
      </div>

      <div class="flex items-center gap-6 flex-shrink-0">
        <div class="flex items-center gap-4">
          <div class="text-center">
            <div class="flex items-center gap-1.5 mb-0.5">
              <iconify-icon
                icon="solar:users-group-rounded-bold-duotone"
                width="16"
                class="text-neutral-400"
              ></iconify-icon>
              <span class="text-lg font-black text-neutral-900">{displayLeads}</span>
            </div>
            <p class="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">Leads</p>
          </div>

          {#if displayLeads > 0}
            <div class="w-px h-8 bg-neutral-200"></div>
            <div class="text-center">
              <div class="flex items-center gap-1.5 mb-0.5">
                <iconify-icon
                  icon="solar:chart-2-bold-duotone"
                  width="16"
                  class="text-neutral-400"
                ></iconify-icon>
                <span class="text-lg font-black {successRateCls}">{successRate}%</span>
              </div>
              <p class="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">Succès</p>
            </div>
          {/if}
        </div>

        <iconify-icon
          icon="solar:alt-arrow-right-bold"
          width="18"
          class="text-neutral-300 group-hover:text-neutral-700 group-hover:translate-x-0.5 transition-all"
        ></iconify-icon>
      </div>
    </div>
  </button>

  <div
    class="border-t border-neutral-100 px-5 py-3 bg-neutral-50/50 flex items-center gap-2"
    onclick={(e) => e.stopPropagation()}
  >
    {#if onRelaunch}
      <button
        onclick={() => onRelaunch!(session.id)}
        disabled={relaunching}
        class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-black text-white hover:bg-neutral-800 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {#if relaunching}
          <div class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          Relance...
        {:else}
          <iconify-icon icon="solar:restart-bold" width="14"></iconify-icon>
          Relancer la chasse
        {/if}
      </button>
    {/if}

    <div class="flex-1"></div>

    {#if onDelete}
      <button
        onclick={() => onDelete!(session.id)}
        disabled={deleting}
        class="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-neutral-500 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        title="Supprimer la chasse"
      >
        {#if deleting}
          <div class="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
        {:else}
          <iconify-icon icon="solar:trash-bin-trash-bold" width="14"></iconify-icon>
          Supprimer
        {/if}
      </button>
    {/if}
  </div>
</div>
