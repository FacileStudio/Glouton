<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import authStore from '$lib/auth-store';
  import { Sidebar } from '@repo/ui';
  import { ws } from '$lib/websocket';
  import SpaceSwitcher from '$lib/components/SpaceSwitcher.svelte';
  import 'iconify-icon';

  let { children } = $props();

  const menuItems = [
    { label: 'Chasses', icon: 'solar:radar-2-linear', href: '/app/hunts' },
    { label: 'Leads', icon: 'solar:magnet-wave-bold-duotone', href: '/app/leads' },
    { label: 'Prospection', icon: 'solar:letter-linear', href: '/app/outreach' },
    { label: 'Espaces', icon: 'solar:users-group-rounded-linear', href: '/app/teams' },
  ];

  let userInitials = $derived($authStore.user?.firstName?.[0] || 'U');
  let userName = $derived($authStore.user?.firstName || 'Utilisateur');
  let userEmail = $derived($authStore.user?.email || 'user@example.com');

  function getPageTitle(path: string): string {
    if (path.startsWith('/app/hunts/new')) return 'Nouvelle Chasse — Glouton';
    if (path.match(/^\/app\/hunts\/.+/)) return 'Chasse — Glouton';
    if (path === '/app/hunts') return 'Chasses — Glouton';
    if (path.match(/^\/app\/leads\/.+/)) return 'Lead — Glouton';
    if (path === '/app/leads') return 'Leads — Glouton';
    if (path === '/app/outreach') return 'Prospection — Glouton';
    if (path === '/app/teams/new') return 'Nouvel Espace — Glouton';
    if (path.match(/^\/app\/teams\/.+\/settings/)) return 'Paramètres d\'espace — Glouton';
    if (path.match(/^\/app\/teams\/.+\/members/)) return 'Membres — Glouton';
    if (path.match(/^\/app\/teams\/.+/)) return 'Espace — Glouton';
    if (path === '/app/teams') return 'Espaces — Glouton';
    if (path === '/app/settings') return 'Paramètres — Glouton';
    if (path === '/app/premium') return 'Premium — Glouton';
    return 'Glouton';
  }

  let pageTitle = $derived(getPageTitle($page.url.pathname));

  let connectionState = ws.connectionState;

  onMount(() => {
    const token = $authStore.session?.token;
    if (token) ws.connect(token);
  });

  onDestroy(() => {
    ws.disconnect();
  });

  $effect(() => {
    if (browser && $authStore.user && $authStore.session?.token) {
      const token = $authStore.session.token;
      const currentState = $connectionState;

      if (currentState === 'disconnected' || currentState === 'failed') {
        ws.connect(token);
      }
    }
  });
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="fixed inset-0 flex h-screen w-screen overflow-hidden bg-background text-foreground">
  <Sidebar
    items={menuItems}
    activeHref={$page.url.pathname}
    settingsHref="/app/settings"
    userHref="/app/settings"
    logoIcon="solar:magnet-wave-bold-duotone"
  >
    <SpaceSwitcher slot="context-switcher" />

    <div
      slot="user-avatar"
      class="flex h-full w-full items-center justify-center text-xs font-semibold"
    >
      {userInitials}
    </div>

    <span slot="user-name">
      {userName}
    </span>

    <span slot="user-email">
      {userEmail}
    </span>

    <button
      slot="logout"
      type="button"
      onclick={() => authStore.logout()}
      class="inline-flex h-9 w-full items-center justify-start gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
    >
      <iconify-icon icon="solar:logout-2-linear" width="16"></iconify-icon>
      Déconnexion
    </button>
  </Sidebar>

  <main
    class="relative h-full w-full flex-1 overflow-y-auto bg-background selection:bg-foreground selection:text-background"
  >
    {@render children()}
  </main>
</div>
