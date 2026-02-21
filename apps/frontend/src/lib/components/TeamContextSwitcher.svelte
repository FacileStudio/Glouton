<script lang="ts">
  import { onMount } from 'svelte';
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
  let currentRole = $derived(teamContextStore.getRole());

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

  function switchToPersonal() {
    teamContextStore.setPersonal();
    closeDropdown();
    toast.push('Switched to personal context', 'success');
  }

  function switchToTeam(teamId: string, name: string, role: 'OWNER' | 'ADMIN' | 'MEMBER') {
    teamContextStore.setTeam(teamId, name, role);
    closeDropdown();
    toast.push(`Switched to ${name}`, 'success');
  }

  function getRoleBadgeColor(role: 'OWNER' | 'ADMIN' | 'MEMBER'): string {
    switch (role) {
      case 'OWNER':
        return 'bg-brand-purple/10 text-brand-purple border-brand-purple/20';
      case 'ADMIN':
        return 'bg-brand-gold/10 text-brand-gold border-brand-gold/20';
      case 'MEMBER':
        return 'bg-slate-50 text-slate-500 border-slate-100';
    }
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
    class="group flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 bg-neutral-50 hover:bg-neutral-100 border border-neutral-100 w-full"
  >
    <div class="flex items-center gap-3 flex-1 min-w-0">
      <div class="flex-shrink-0">
        {#if context.type === 'personal'}
          <iconify-icon
            icon="solar:user-bold"
            width="20"
            class="text-neutral-600"
          ></iconify-icon>
        {:else}
          <iconify-icon
            icon="solar:users-group-rounded-bold"
            width="20"
            class="text-brand-purple"
          ></iconify-icon>
        {/if}
      </div>

      <div class="flex-1 min-w-0 text-left">
        <p class="text-[13px] font-black text-black truncate leading-tight">
          {displayName}
        </p>
        {#if currentRole}
          <p class="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">
            {currentRole}
          </p>
        {:else}
          <p class="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">
            Espace personnel
          </p>
        {/if}
      </div>

      <iconify-icon
        icon="solar:alt-arrow-down-bold"
        width="16"
        class="text-neutral-400 transition-transform group-hover:text-black {isOpen ? 'rotate-180' : ''}"
      ></iconify-icon>
    </div>
  </button>

  {#if isOpen}
    <div class="absolute left-0 right-0 mt-2 bg-white border-2 border-neutral-100 rounded-2xl shadow-lg overflow-hidden z-50">
      {#if loading}
        <div class="px-4 py-8 text-center">
          <div class="inline-block w-6 h-6 border-2 border-neutral-200 border-t-brand-purple rounded-full animate-spin"></div>
          <p class="mt-2 text-[11px] font-bold text-neutral-400">Loading teams...</p>
        </div>
      {:else if error}
        <div class="px-4 py-4 text-center">
          <p class="text-[12px] font-bold text-danger">{error}</p>
        </div>
      {:else}
        <div class="py-2">
          <button
            onclick={switchToPersonal}
            class="group w-full flex items-center gap-3 px-4 py-3 transition-all duration-200 {context.type === 'personal' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50 hover:text-black'}"
          >
            <iconify-icon
              icon="solar:user-bold"
              width="18"
              class={context.type === 'personal' ? 'text-white' : 'text-neutral-400 group-hover:text-black'}
            ></iconify-icon>
            <span class="text-[13px] font-bold tracking-tight">
              Personnel
            </span>
            {#if context.type === 'personal'}
              <iconify-icon
                icon="solar:check-circle-bold"
                width="16"
                class="ml-auto text-white"
              ></iconify-icon>
            {/if}
          </button>

          {#if teams.length > 0}
            <div class="my-2 border-t border-neutral-100"></div>

            {#each teams as team}
              {@const isActive = context.type === 'team' && context.teamId === team.id}
              <button
                onclick={() => switchToTeam(team.id, team.name, team.role)}
                class="group w-full flex items-center gap-3 px-4 py-3 transition-all duration-200 {isActive ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50 hover:text-black'}"
              >
                <iconify-icon
                  icon="solar:users-group-rounded-bold"
                  width="18"
                  class={isActive ? 'text-white' : 'text-brand-purple'}
                ></iconify-icon>
                <div class="flex-1 min-w-0 text-left">
                  <p class="text-[13px] font-bold tracking-tight truncate">
                    {team.name}
                  </p>
                  {#if team.description}
                    <p class="text-[10px] font-medium {isActive ? 'text-neutral-300' : 'text-neutral-400'} truncate">
                      {team.description}
                    </p>
                  {/if}
                </div>
                <span class="inline-flex items-center justify-center px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tight border min-w-[50px] {isActive ? 'bg-white/10 text-white border-white/20' : getRoleBadgeColor(team.role)}">
                  {team.role}
                </span>
                {#if isActive}
                  <iconify-icon
                    icon="solar:check-circle-bold"
                    width="16"
                    class="text-white"
                  ></iconify-icon>
                {/if}
              </button>
            {/each}
          {/if}

          <div class="mt-2 border-t border-neutral-100"></div>

          <a
            href="/app/teams/new"
            data-sveltekit-reload
            class="group w-full flex items-center gap-3 px-4 py-3 text-neutral-600 hover:bg-neutral-50 hover:text-brand-purple transition-all duration-200"
            onclick={closeDropdown}
          >
            <iconify-icon
              icon="solar:add-circle-bold"
              width="18"
              class="text-brand-purple"
            ></iconify-icon>
            <span class="text-[13px] font-bold tracking-tight">
              Create New Team
            </span>
          </a>
        </div>
      {/if}
    </div>
  {/if}
</div>
