<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '$lib/auth-store';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { ToastContainer } from '@repo/ui';
  import { logger } from '@repo/logger';
  import '../app.css';

  let { children } = $props();

  /**
   * onMount
   */
  onMount(async () => {
    await authStore.init();
    logger.info('Auth store initialized');
  });

  $effect(() => {
    /**
     * if
     */
    if (!$authStore.loading) {
      const path = page.url.pathname;
      const user = $authStore.user;

      /**
       * if
       */
      if (path.startsWith('/admin') && !user)
        /**
         * goto
         */
        goto(resolve('/'));

      /**
       * if
       */
      if (path === '/' && user)
        /**
         * goto
         */
        goto(resolve('/admin/contacts'));
    }
  });
</script>

{#if $authStore.loading}
  <div class="h-screen flex flex-col items-center justify-center gap-6" style="background-color: #FAF7F5;">
    <iconify-icon icon="svg-spinners:blocks-shuffle-3" width="48" style="color: #291334;"></iconify-icon>
    <p class="text-xs font-black tracking-[0.3em]" style="color: #291334; opacity: 0.4;">
      Loading...
    </p>
  </div>
{:else}
  {@render children()}
{/if}

<ToastContainer />
