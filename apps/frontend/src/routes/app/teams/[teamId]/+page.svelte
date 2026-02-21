<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { Spinner, EmptyState } from '@repo/ui';
  import { toast } from '@repo/utils';
  import 'iconify-icon';

  let teamId = $derived($page.params.teamId);
  let team = $state<any>(null);
  let stats = $state<any>(null);
  let loading = $state(true);
  let loadingStats = $state(true);

  onMount(async () => {
    await Promise.all([loadTeam(), loadStats()]);
  });

  async function loadTeam() {
    loading = true;
    try {
      team = await trpc.team.get.query({ teamId });
    } catch (error: any) {
      console.error('Error loading team:', error);
      toast.push(error?.message || 'Échec du chargement de l\'équipe', 'error');
      goto('/app/teams');
    } finally {
      loading = false;
    }
  }

  async function loadStats() {
    loadingStats = true;
    try {
      stats = await trpc.team.getStats.query({ teamId });
    } catch (error) {
      console.error('Error loading stats:', error);
      stats = null;
    } finally {
      loadingStats = false;
    }
  }

  function getRoleBadgeColor(role: string) {
    switch (role) {
      case 'OWNER':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'ADMIN':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      default:
        return 'bg-neutral-100 text-neutral-700 border-neutral-200';
    }
  }

  function getRoleLabel(role: string) {
    switch (role) {
      case 'OWNER':
        return 'Propriétaire';
      case 'ADMIN':
        return 'Admin';
      default:
        return 'Membre';
    }
  }

  function handleNavigate(path: string) {
    goto(`/app/teams/${teamId}${path}`);
  }

  function handleBack() {
    goto('/app/teams');
  }
</script>

<div
  class="p-6 lg:p-12 max-w-[1600px] mx-auto space-y-12 selection:text-black font-sans"
  style="background-color: #FAF7F5; selection-background-color: #FEC129;"
>
  {#if loading}
    <div class="flex items-center justify-center py-20">
      <Spinner size="lg" />
    </div>
  {:else if team}
    <div class="flex items-center gap-4">
      <button
        onclick={handleBack}
        class="w-12 h-12 flex items-center justify-center bg-white rounded-xl hover:bg-neutral-50 transition-colors border border-neutral-100"
      >
        <iconify-icon icon="solar:arrow-left-bold" width="20" class="text-neutral-700"></iconify-icon>
      </button>
      <div class="flex-1">
        <div class="flex items-center gap-3">
          <h1 class="text-3xl md:text-4xl font-black tracking-tight" style="color: #291334;">
            {team.name}
          </h1>
          <span class="inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold uppercase border {getRoleBadgeColor(team.userRole)}">
            {getRoleLabel(team.userRole)}
          </span>
        </div>
        {#if team.description}
          <p class="text-neutral-500 font-medium text-base mt-1">
            {team.description}
          </p>
        {/if}
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <button
        onclick={() => handleNavigate('/members')}
        class="bg-white rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all border border-neutral-100 text-left group hover:scale-[1.02] active:scale-[0.98]"
      >
        <div class="flex items-center justify-between mb-2">
          <iconify-icon icon="solar:users-group-rounded-bold" width="32" class="text-neutral-700 group-hover:text-black"></iconify-icon>
          <iconify-icon icon="solar:arrow-right-bold" width="20" class="text-neutral-300 group-hover:text-neutral-700"></iconify-icon>
        </div>
        <h3 class="font-bold text-sm text-neutral-500 uppercase">Membres</h3>
        <p class="text-2xl font-black text-neutral-900 mt-1">
          {loadingStats ? '...' : stats?.memberCount || 0}
        </p>
      </button>

      <button
        onclick={() => goto('/app/leads')}
        class="bg-white rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all border border-neutral-100 text-left group hover:scale-[1.02] active:scale-[0.98]"
      >
        <div class="flex items-center justify-between mb-2">
          <iconify-icon icon="solar:chart-square-bold" width="32" class="text-neutral-700 group-hover:text-black"></iconify-icon>
          <iconify-icon icon="solar:arrow-right-bold" width="20" class="text-neutral-300 group-hover:text-neutral-700"></iconify-icon>
        </div>
        <h3 class="font-bold text-sm text-neutral-500 uppercase">Leads</h3>
        <p class="text-2xl font-black text-neutral-900 mt-1">
          {loadingStats ? '...' : stats?.totalLeads || 0}
        </p>
      </button>

      <button
        onclick={() => handleNavigate('/settings')}
        class="bg-white rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all border border-neutral-100 text-left group hover:scale-[1.02] active:scale-[0.98]"
      >
        <div class="flex items-center justify-between mb-2">
          <iconify-icon icon="solar:settings-bold" width="32" class="text-neutral-700 group-hover:text-black"></iconify-icon>
          <iconify-icon icon="solar:arrow-right-bold" width="20" class="text-neutral-300 group-hover:text-neutral-700"></iconify-icon>
        </div>
        <h3 class="font-bold text-sm text-neutral-500 uppercase">Paramètres</h3>
        <p class="text-sm font-medium text-neutral-600 mt-1">
          {team.userRole === 'OWNER' || team.userRole === 'ADMIN' ? 'Gérer l\'équipe' : 'Voir les détails'}
        </p>
      </button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-neutral-100">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
            <iconify-icon icon="solar:fire-bold" width="20" class="text-orange-600"></iconify-icon>
          </div>
          <h3 class="font-bold text-sm text-neutral-500 uppercase">Leads Chauds</h3>
        </div>
        <p class="text-3xl font-black text-neutral-900">
          {loadingStats ? '...' : stats?.hotLeads || 0}
        </p>
      </div>

      <div class="bg-white rounded-2xl p-6 shadow-sm border border-neutral-100">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <iconify-icon icon="solar:lightning-bold" width="20" class="text-purple-600"></iconify-icon>
          </div>
          <h3 class="font-bold text-sm text-neutral-500 uppercase">Chasses</h3>
        </div>
        <p class="text-3xl font-black text-neutral-900">
          {loadingStats ? '...' : stats?.totalHunts || 0}
        </p>
        {#if stats?.activeHunts > 0}
          <p class="text-xs text-green-600 font-bold mt-1">
            {stats.activeHunts} active{stats.activeHunts !== 1 ? 's' : ''}
          </p>
        {/if}
      </div>

      <div class="bg-white rounded-2xl p-6 shadow-sm border border-neutral-100">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <iconify-icon icon="solar:shield-check-bold" width="20" class="text-blue-600"></iconify-icon>
          </div>
          <h3 class="font-bold text-sm text-neutral-500 uppercase">Audits</h3>
        </div>
        <p class="text-3xl font-black text-neutral-900">
          {loadingStats ? '...' : stats?.totalAudits || 0}
        </p>
      </div>

      <div class="bg-white rounded-2xl p-6 shadow-sm border border-neutral-100">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
            <iconify-icon icon="solar:letter-bold" width="20" class="text-green-600"></iconify-icon>
          </div>
          <h3 class="font-bold text-sm text-neutral-500 uppercase">Emails Envoyés</h3>
        </div>
        <p class="text-3xl font-black text-neutral-900">
          {loadingStats ? '...' : stats?.emailsSent || 0}
        </p>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="bg-white rounded-2xl p-8 shadow-sm border border-neutral-100">
        <h3 class="font-black text-xl mb-4 text-neutral-900">Actions rapides</h3>
        <div class="space-y-3">
          <button
            onclick={() => goto('/app/hunts/new')}
            class="w-full flex items-center gap-3 p-4 rounded-xl bg-neutral-50 hover:bg-neutral-100 transition-colors text-left"
          >
            <iconify-icon icon="solar:lightning-bold" width="24" class="text-neutral-700"></iconify-icon>
            <div>
              <p class="font-bold text-neutral-900">Lancer une chasse</p>
              <p class="text-xs text-neutral-500">Trouver de nouveaux leads</p>
            </div>
          </button>

          <button
            onclick={() => goto('/app/leads')}
            class="w-full flex items-center gap-3 p-4 rounded-xl bg-neutral-50 hover:bg-neutral-100 transition-colors text-left"
          >
            <iconify-icon icon="solar:chart-square-bold" width="24" class="text-neutral-700"></iconify-icon>
            <div>
              <p class="font-bold text-neutral-900">Voir les leads</p>
              <p class="text-xs text-neutral-500">Gérer vos prospects</p>
            </div>
          </button>

          <button
            onclick={() => handleNavigate('/members')}
            class="w-full flex items-center gap-3 p-4 rounded-xl bg-neutral-50 hover:bg-neutral-100 transition-colors text-left"
          >
            <iconify-icon icon="solar:users-group-rounded-bold" width="24" class="text-neutral-700"></iconify-icon>
            <div>
              <p class="font-bold text-neutral-900">Gérer les membres</p>
              <p class="text-xs text-neutral-500">Inviter et gérer l'équipe</p>
            </div>
          </button>
        </div>
      </div>

      <div class="bg-white rounded-2xl p-8 shadow-sm border border-neutral-100">
        <h3 class="font-black text-xl mb-4 text-neutral-900">Informations</h3>
        <div class="space-y-4">
          <div>
            <p class="text-xs font-bold text-neutral-500 uppercase mb-1">Créée le</p>
            <p class="text-sm font-medium text-neutral-900">
              {new Date(team.createdAt).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </p>
          </div>

          <div>
            <p class="text-xs font-bold text-neutral-500 uppercase mb-1">Dernière mise à jour</p>
            <p class="text-sm font-medium text-neutral-900">
              {new Date(team.updatedAt).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </p>
          </div>

          <div>
            <p class="text-xs font-bold text-neutral-500 uppercase mb-1">Votre rôle</p>
            <span class="inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold uppercase border {getRoleBadgeColor(team.userRole)}">
              {getRoleLabel(team.userRole)}
            </span>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
