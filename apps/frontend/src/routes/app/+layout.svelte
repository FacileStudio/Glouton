<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import authStore from '$lib/auth-store';
  import { Sidebar } from '@repo/ui';
  import { ws } from '$lib/websocket';
  import TeamContextSwitcher from '$lib/components/TeamContextSwitcher.svelte';
  import 'iconify-icon';

  let { children } = $props();

  const menuItems = [
    { label: 'Chasses', icon: 'solar:lightning-bold', href: '/app/hunts' },
    { label: 'Leads', icon: 'solar:chart-square-bold', href: '/app/leads' },
    { label: 'Prospection', icon: 'solar:letter-bold', href: '/app/outreach' },
    { label: 'Équipes', icon: 'solar:users-group-rounded-bold', href: '/app/teams' },
  ];

  let userInitials = $derived($authStore.user?.firstName?.[0] || 'U');
  let userName = $derived($authStore.user?.firstName || 'Utilisateur');

  function getPageTitle(path: string): string {
    if (path.startsWith('/app/hunts/new')) return 'Nouvelle Chasse — Glouton';
    if (path.match(/^\/app\/hunts\/.+/)) return 'Chasse — Glouton';
    if (path === '/app/hunts') return 'Chasses — Glouton';
    if (path.match(/^\/app\/leads\/.+/)) return 'Lead — Glouton';
    if (path === '/app/leads') return 'Leads — Glouton';
    if (path === '/app/outreach') return 'Prospection — Glouton';
    if (path === '/app/teams/new') return 'Nouvelle Équipe — Glouton';
    if (path.match(/^\/app\/teams\/.+\/settings/)) return 'Paramètres d\'équipe — Glouton';
    if (path.match(/^\/app\/teams\/.+\/members/)) return 'Membres — Glouton';
    if (path.match(/^\/app\/teams\/.+/)) return 'Équipe — Glouton';
    if (path === '/app/teams') return 'Équipes — Glouton';
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

<div class="fixed inset-0 flex h-screen w-screen overflow-hidden bg-white">
  <Sidebar
    items={menuItems}
    activeHref={$page.url.pathname}
    settingsHref="/app/settings"
    logoSrc="/logo.png"
  >
    <TeamContextSwitcher slot="context-switcher" />

    <div
      slot="user-avatar"
      class="flex h-full w-full items-center justify-center bg-black text-xs font-black text-white"
    >
      {userInitials}
    </div>

    <span slot="user-name">
      {userName}
    </span>
  </Sidebar>

  <main
    class="relative h-full w-full flex-1 overflow-y-auto selection:bg-black selection:text-white"
  >
    {@render children()}
  </main>
</div>
