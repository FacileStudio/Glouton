<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import authStore from '$lib/auth-store';
  import { Sidebar } from '@repo/ui';
  import { ws } from '$lib/websocket';
  import 'iconify-icon';

  let { children } = $props();

  const menuItems = [
    { label: 'Hunts', icon: 'solar:lightning-bold', href: '/app/hunts' },
    { label: 'Leads', icon: 'solar:chart-square-bold', href: '/app/leads' },
    { label: 'Outreach', icon: 'solar:letter-bold', href: '/app/outreach' },
  ];

  let userInitials = $derived($authStore.user?.firstName?.[0] || 'U');
  let userName = $derived($authStore.user?.firstName || 'Utilisateur');

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

<div class="fixed inset-0 flex h-screen w-screen overflow-hidden bg-white">
  <Sidebar
    items={menuItems}
    activeHref={$page.url.pathname}
    settingsHref="/app/settings"
    logoSrc="/logo.png"
  >
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
