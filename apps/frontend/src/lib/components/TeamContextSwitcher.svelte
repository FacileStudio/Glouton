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
    class="group flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200 hover:bg-neutral-50 border border-transparent hover:border-neutral-200 w-full"
  >
    <div class="flex items-center gap-2 flex-1 min-w-0">
      <div class="flex-shrink-0">
        {#if context.type === 'personal'}
          <iconify-icon
            icon="solar:user-bold"
            width="18"
            class="text-neutral-500"
          ></iconify-icon>
        {:else}
          <iconify-icon
            icon="solar:users-group-rounded-bold"
            width="18"
            class="text-neutral-700"
          ></iconify-icon>
        {/if}
      </div>

      <div class="flex-1 min-w-0 text-left">
        <p class="text-[12px] font-bold text-neutral-800 truncate leading-tight">
          {displayName}
        </p>
      </div>

      <iconify-icon
        icon="solar:alt-arrow-down-bold"
        width="14"
        class="text-neutral-400 transition-transform {isOpen ? 'rotate-180' : ''}"
      ></iconify-icon>
    </div>
  </button>

  {#if isOpen}
    <div class="absolute left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden z-50">
      {#if loading}
        <div class="px-3 py-6 text-center">
          <div class="inline-block w-5 h-5 border-2 border-neutral-200 border-t-neutral-700 rounded-full animate-spin"></div>
        </div>
      {:else if error}
        <div class="px-3 py-3 text-center">
          <p class="text-[11px] font-medium text-red-600">{error}</p>
        </div>
      {:else}
        <div class="py-1">
          <button
            onclick={switchToPersonal}
            class="group w-full flex items-center gap-2 px-3 py-2 transition-all duration-150 {context.type === 'personal' ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50'}"
          >
            <iconify-icon
              icon="solar:user-bold"
              width="16"
              class={context.type === 'personal' ? 'text-neutral-700' : 'text-neutral-400'}
            ></iconify-icon>
            <span class="text-[12px] font-medium">
              Personnel
            </span>
            {#if context.type === 'personal'}
              <iconify-icon
                icon="solar:check-circle-bold"
                width="14"
                class="ml-auto text-neutral-700"
              ></iconify-icon>
            {/if}
          </button>

          {#if teams.length > 0}
            <div class="my-1 border-t border-neutral-100"></div>

            {#each teams as team}
              {@const isActive = context.type === 'team' && context.teamId === team.id}
              <button
                onclick={() => switchToTeam(team.id, team.name, team.role)}
                class="group w-full flex items-center gap-2 px-3 py-2 transition-all duration-150 {isActive ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50'}"
              >
                <iconify-icon
                  icon="solar:users-group-rounded-bold"
                  width="16"
                  class={isActive ? 'text-neutral-700' : 'text-neutral-500'}
                ></iconify-icon>
                <div class="flex-1 min-w-0 text-left">
                  <p class="text-[12px] font-medium truncate">
                    {team.name}
                  </p>
                </div>
                {#if isActive}
                  <iconify-icon
                    icon="solar:check-circle-bold"
                    width="14"
                    class="ml-auto text-neutral-700"
                  ></iconify-icon>
                {/if}
              </button>
            {/each}
          {/if}

          <div class="my-1 border-t border-neutral-100"></div>

          <a
            href="/app/teams/new"
            data-sveltekit-reload
            class="group w-full flex items-center gap-2 px-3 py-2 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 transition-all duration-150"
            onclick={closeDropdown}
          >
            <iconify-icon
              icon="mdi:plus-circle"
              width="16"
              class="text-neutral-400"
            ></iconify-icon>
            <span class="text-[12px] font-medium">
              Nouvelle équipe
            </span>
          </a>
        </div>
      {/if}
    </div>
  {/if}
</div>
