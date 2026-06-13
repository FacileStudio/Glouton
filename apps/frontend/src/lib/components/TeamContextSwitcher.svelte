<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll, afterNavigate } from '$app/navigation';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import trpc from '$lib/trpc';
  import { toast } from '@repo/utils';
  import 'iconify-icon';

  let isOpen = $state(false);
  let teams = $state<Array<{
    id: string;
    name: string;
    description: string | null;
    role: 'OWNER' | 'ADMIN' | 'MEMBER';
    joinedAt: Date;
  }>>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let context = $derived(teamContextStore.context);
  let displayName = $derived(teamContextStore.getName());

  async function loadTeams() {
    // Only show the spinner on the very first load; background refreshes
    // keep the current list visible.
    if (teams.length === 0) loading = true;
    error = null;
    try {
      const result = await trpc.team.list.query();
      teams = result;

      // Contexte orphelin : l'équipe active a été supprimée (ou on en a été
      // retiré). On revient au personnel pour ne pas envoyer un teamId mort.
      const ctx = teamContextStore.context;
      if (ctx.type === 'team' && !result.some((team) => team.id === ctx.teamId)) {
        teamContextStore.setPersonal();
        toast.push("L'équipe active n'existe plus, retour à l'espace personnel", 'info');
        await invalidateAll();
        window.location.reload();
        return;
      }
    } catch (err) {
      console.error('Failed to load teams:', err);
      if (teams.length === 0) error = 'Échec du chargement des équipes';
    } finally {
      loading = false;
    }
  }

  function toggleDropdown() {
    isOpen = !isOpen;
    // Refresh on open: always up to date, and retries after a network error.
    if (isOpen) loadTeams();
  }

  function closeDropdown() {
    isOpen = false;
  }

  async function switchToPersonal() {
    teamContextStore.setPersonal();
    closeDropdown();
    toast.push('Switched to personal context', 'success');
    await invalidateAll();
    window.location.reload();
  }

  async function switchToTeam(teamId: string, name: string, role: 'OWNER' | 'ADMIN' | 'MEMBER') {
    teamContextStore.setTeam(teamId, name, role);
    closeDropdown();
    toast.push(`Switched to ${name}`, 'success');
    await invalidateAll();
    window.location.reload();
  }

  // Référence locale : le composant peut être rendu plusieurs fois (sidebar
  // desktop + page settings mobile), un id global pointerait toujours sur la
  // première instance et fermerait les autres au moindre clic.
  let container = $state<HTMLElement | null>(null);

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (container && !container.contains(target)) {
      closeDropdown();
    }
  }

  // Re-fetch after client-side navigations so a newly created team shows up
  // immediately without a manual reload. The initial load is done in onMount.
  afterNavigate((nav) => {
    if (nav.from) loadTeams();
  });

  onMount(() => {
    loadTeams();
    if (typeof document !== 'undefined') {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  });
</script>

<div class="relative" bind:this={container}>
  <button
    onclick={toggleDropdown}
    class="inline-flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
  >
    {#if context.type === 'personal'}
      <iconify-icon
        icon="solar:user-linear"
        width="16"
        class="text-muted-foreground shrink-0"
      ></iconify-icon>
    {:else}
      <iconify-icon
        icon="solar:users-group-rounded-linear"
        width="16"
        class="text-foreground shrink-0"
      ></iconify-icon>
    {/if}

    <span class="flex-1 min-w-0 truncate text-left text-foreground">
      {displayName}
    </span>

    <iconify-icon
      icon="solar:alt-arrow-down-linear"
      width="14"
      class="text-muted-foreground transition-transform {isOpen ? 'rotate-180' : ''}"
    ></iconify-icon>
  </button>

  {#if isOpen}
    <div class="absolute left-0 right-0 mt-1 rounded-xl border border-border bg-card overflow-hidden z-50">
      {#if loading}
        <div class="px-3 py-6 text-center">
          <div class="inline-block w-5 h-5 border-2 border-border border-t-foreground rounded-full animate-spin"></div>
        </div>
      {:else if error}
        <div class="px-3 py-3 text-center">
          <p class="text-xs text-destructive">{error}</p>
        </div>
      {:else}
        <div class="py-1">
          <button
            onclick={switchToPersonal}
            class="flex h-9 w-full items-center gap-2 px-3 text-sm transition-colors {context.type === 'personal' ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
          >
            <iconify-icon
              icon="solar:user-linear"
              width="16"
            ></iconify-icon>
            <span>Personnel</span>
            {#if context.type === 'personal'}
              <iconify-icon
                icon="solar:check-circle-linear"
                width="14"
                class="ml-auto"
              ></iconify-icon>
            {/if}
          </button>

          {#if teams.length > 0}
            <div class="my-1 border-t border-border"></div>

            {#each teams as team}
              {@const isActive = context.type === 'team' && context.teamId === team.id}
              <button
                onclick={() => switchToTeam(team.id, team.name, team.role)}
                class="flex h-9 w-full items-center gap-2 px-3 text-sm transition-colors {isActive ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
              >
                <iconify-icon
                  icon="solar:users-group-rounded-linear"
                  width="16"
                ></iconify-icon>
                <span class="flex-1 min-w-0 truncate text-left">
                  {team.name}
                </span>
                {#if isActive}
                  <iconify-icon
                    icon="solar:check-circle-linear"
                    width="14"
                    class="ml-auto"
                  ></iconify-icon>
                {/if}
              </button>
            {/each}
          {/if}

          <div class="my-1 border-t border-border"></div>

          <a
            href="/app/teams/new"
            data-sveltekit-reload
            class="flex h-9 w-full items-center gap-2 px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            onclick={closeDropdown}
          >
            <iconify-icon
              icon="mdi:plus-circle"
              width="16"
            ></iconify-icon>
            <span>Nouvelle équipe</span>
          </a>
        </div>
      {/if}
    </div>
  {/if}
</div>
