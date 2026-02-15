<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import authStore from '$lib/auth-store';
  import { page } from '$app/stores';
  import { Sidebar } from '@repo/ui';
  import { ws } from '$lib/websocket';
  import 'iconify-icon';

  const menuItems = [
    { label: 'Hunts', icon: 'solar:lightning-bold', href: '/app/hunts' },
    { label: 'Leads', icon: 'solar:chart-square-bold', href: '/app/leads' },
    { label: 'Outreach', icon: 'solar:letter-bold', href: '/app/outreach' },
    { label: 'Opportunities', icon: 'solar:case-minimalistic-bold', href: '/app/opportunities' },
  ];

  $: userInitials = $authStore.user?.firstName?.[0] || 'U';
  $: userName = $authStore.user?.firstName || 'Utilisateur';

  /**
   * onMount
   */
  onMount(() => {
    console.log('[APP-LAYOUT] onMount called');
    const token = $authStore.session?.token;
    console.log('[APP-LAYOUT] Token from authStore:', token ? `${token.slice(0, 20)}...` : 'NOT FOUND');

    /**
     * if
     */
    if (token) {
      console.log('[APP-LAYOUT] Calling ws.connect()');
      ws.connect(token);
    } else {
      console.warn('[APP-LAYOUT] No token found, WebSocket not connecting');
    }
  });

  /**
   * onDestroy
   */
  onDestroy(() => {
    console.log('[APP-LAYOUT] onDestroy called, disconnecting WebSocket');
    ws.disconnect();
  });

  $: connectionState = ws.connectionState;

  $: {
    /**
     * if
     */
    if (browser && $authStore.user && $authStore.session?.token) {
      const token = $authStore.session.token;
      const currentState = $connectionState;
      /**
       * if
       */
      if (currentState === 'disconnected' || currentState === 'failed') {
        console.log('[APP-LAYOUT] Auth state changed, reconnecting WebSocket');
        ws.connect(token);
      }
    }
  }
</script>

<div class="flex min-h-screen w-full">
  <Sidebar items={menuItems} activeHref={$page.url.pathname} settingsHref="/app/settings" logoSrc="/logo.png">
    <div
      slot="user-avatar"
      class="w-full h-full flex items-center justify-center bg-black text-white font-black text-xs"
    >
      {userInitials}
    </div>

    <span slot="user-name">
      {userName}
    </span>
  </Sidebar>

  <main class="flex-1 h-screen overflow-y-auto selection:bg-black selection:text-white w-full">
    <slot />
  </main>
</div>

<style>
  :global(body) {
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden;
    width: 100vw !important;
    max-width: 100vw !important;
  }

  :global(html) {
    margin: 0 !important;
    padding: 0 !important;
    width: 100vw !important;
    max-width: 100vw !important;
  }

  :global(#svelte) {
    width: 100% !important;
    max-width: 100% !important;
  }
</style>
