<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '$lib/auth-store';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/stores';
  import { ToastContainer } from '@repo/ui';
  import '../app.css';

  /**
   * onMount
   */
  onMount(async () => {
    await authStore.init();
  });

  $: if (!$authStore.loading) {
    const path = $page.url.pathname;
    const user = $authStore.user;

    /**
     * if
     */
    if (path.startsWith('/app') && !user) {
      /**
       * goto
       */
      goto(resolve('/login'));
    }

    /**
     * if
     */
    if ((path === '/login' || path === '/register') && user) {
      /**
       * goto
       */
      goto(resolve('/app/leads'));
    }
  }
</script>

{#if $authStore.loading}
  <div class="h-screen flex flex-col items-center justify-center gap-6">
    <iconify-icon icon="svg-spinners:blocks-shuffle-3" width="48" class="text-brand-purple"></iconify-icon>
    <p class="text-xs font-black uppercase tracking-[0.3em] text-brand-purple/40">
      Loading...
    </p>
  </div>
{:else}
  <slot />
{/if}
<ToastContainer />
