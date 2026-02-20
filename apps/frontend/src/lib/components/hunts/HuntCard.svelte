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

  function formatTimeAgo(date: Date): string {
    const mins = Math.floor((new Date().getTime() - new Date(date).getTime()) / 60000);
    if (mins < 2) return "À l'instant";
    if (mins < 60) return `Il y a ${mins}min`;
    if (mins < 1440) return `Il y a ${Math.floor(mins / 60)}h`;
    return `Il y a ${Math.floor(mins / 1440)}j`;
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

  const statusConfig = $derived.by(() => {
    switch (session.status) {
      case 'COMPLETED':
        return {
          label: 'Terminée',
          badgeCls: 'bg-green-100 text-green-700',
          accentCls: 'bg-green-500',
          borderCls: 'border-green-300',
        };
      case 'FAILED':
        return {
          label: 'Échouée',
          badgeCls: 'bg-red-100 text-red-700',
          accentCls: 'bg-red-500',
          borderCls: 'border-red-300',
        };
      case 'PENDING':
        return {
          label: 'En attente',
          badgeCls: 'bg-amber-100 text-amber-700',
          accentCls: 'bg-amber-400',
          borderCls: 'border-amber-300',
        };
      default:
        return {
          label: session.status,
          badgeCls: 'bg-neutral-100 text-neutral-600',
          accentCls: 'bg-neutral-400',
          borderCls: 'border-neutral-200',
        };
    }
  });

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
  role="button"
  tabindex="0"
  onclick={() => goto(`/app/hunts/${session.id}`)}
  onkeydown={(e) => e.key === 'Enter' && goto(`/app/hunts/${session.id}`)}
  class="group relative rounded-2xl bg-white shadow-md hover:shadow-2xl hover:-translate-y-1 hover:scale-[1.01] transition-all duration-200 cursor-pointer overflow-hidden border border-neutral-100 hover:border-neutral-200"
>
  <div class="p-5">
    <!-- Top row: title + actions -->
    <div class="flex items-start gap-3 mb-4">
      <!-- Title + meta -->
      <div class="flex-1 min-w-0">
        <p
          class="font-black text-neutral-900 text-sm leading-snug truncate mb-1"
          title={huntTitle}
        >
          {huntTitle}
        </p>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wide {statusConfig.badgeCls}">
            {statusConfig.label}
          </span>
          <span class="text-[10px] font-bold text-neutral-400">
            {formatTimeAgo(referenceDate)}
          </span>
          <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">
            {isLocal ? 'Local' : 'Domaine'}
          </span>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="flex items-center gap-1 flex-shrink-0" onclick={(e) => e.stopPropagation()}>
        {#if session.status === 'PENDING' && onCancel}
          <button
            onclick={() => onCancel!(session.id)}
            disabled={cancelling}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wide border border-red-200 text-red-600 hover:bg-red-600 hover:text-white hover:border-red-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if cancelling}
              <div class="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
              Annulation...
            {:else}
              <iconify-icon icon="solar:close-circle-bold" width="12"></iconify-icon>
              Annuler
            {/if}
          </button>
        {/if}

        {#if session.status === 'FAILED' && onRelaunch}
          <button
            onclick={() => onRelaunch!(session.id)}
            disabled={relaunching}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wide border border-neutral-200 text-neutral-700 hover:bg-black hover:text-white hover:border-black transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Relancer la chasse"
          >
            {#if relaunching}
              <div class="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
              Relance...
            {:else}
              <iconify-icon icon="solar:restart-bold" width="12"></iconify-icon>
              Relancer
            {/if}
          </button>
        {/if}

        {#if (session.status === 'COMPLETED' || session.status === 'FAILED') && onDelete}
          <button
            onclick={() => onDelete!(session.id)}
            disabled={deleting}
            class="w-8 h-8 rounded-xl flex items-center justify-center text-neutral-300 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title="Supprimer la chasse"
          >
            {#if deleting}
              <div class="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
            {:else}
              <iconify-icon icon="solar:trash-bin-trash-bold" width="16"></iconify-icon>
            {/if}
          </button>
        {/if}
      </div>
    </div>

    <!-- Error block (failed only) -->
    {#if session.status === 'FAILED' && session.error}
      <div class="bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 mb-4">
        <p class="text-xs text-red-700 font-medium line-clamp-2 leading-relaxed break-words overflow-hidden">{session.error}</p>
      </div>
    {/if}

    <!-- Metrics footer -->
    <div class="flex items-center gap-4 pt-3 border-t border-neutral-100">
      <div class="flex items-center gap-1.5">
        <iconify-icon
          icon="solar:users-group-rounded-bold-duotone"
          width="15"
          class="text-neutral-400"
        ></iconify-icon>
        <span class="text-xs font-black text-neutral-900">{displayLeads}</span>
        <span class="text-xs font-bold text-neutral-400">leads</span>

      </div>

      {#if session.status === 'COMPLETED' && displayLeads > 0}
        <div class="w-px h-3 bg-neutral-200"></div>
        <div class="flex items-center gap-1.5">
          <iconify-icon
            icon="solar:chart-2-bold-duotone"
            width="15"
            class="text-neutral-400"
          ></iconify-icon>
          <span class="text-xs font-black {successRateCls}">{successRate}%</span>
          <span class="text-xs font-bold text-neutral-400">succès</span>
        </div>
      {/if}

      <div class="ml-auto">
        <iconify-icon
          icon="solar:alt-arrow-right-bold"
          width="15"
          class="text-neutral-300 group-hover:text-neutral-700 group-hover:translate-x-0.5 transition-all"
        ></iconify-icon>
      </div>
    </div>
  </div>
</div>
