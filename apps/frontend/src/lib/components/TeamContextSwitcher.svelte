<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
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
    loading = true;
    error = null;
    try {
      const result = await trpc.team.list.query();
      teams = result;
    } catch (err) {
      console.error('Failed to load teams:', err);
      error = 'Failed to load teams';
      toast.push('Failed to load teams', 'error');
    } finally {
      loading = false;
    }
  }

  function toggleDropdown() {
    isOpen = !isOpen;
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

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const dropdown = document.getElementById('team-context-dropdown');
    if (dropdown && !dropdown.contains(target)) {
      closeDropdown();
    }
  }

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

<div class="relative" id="team-context-dropdown">
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
