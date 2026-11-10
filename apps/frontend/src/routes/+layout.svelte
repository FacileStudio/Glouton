<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { Spinner, Toaster, LOCALE_COOKIE, provideLocale } from '@facile/muse';
  import { authStore } from '$lib/auth-store';

  let { data, children } = $props();

  provideLocale(() => (data.chosen ? data.locale : ($authStore.user?.locale ?? data.locale)));

  $effect(() => {
    const locale = $authStore.user?.locale;
    if (browser && locale && !data.chosen) document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  });

  if (browser) void import('iconify-icon');

  onMount(async () => {
    await authStore.init();
  });

  $effect(() => {
    if (!$authStore.loading) {
      const path = page.url.pathname;
      const user = $authStore.user;

      if (path.startsWith('/app') && !user) goto(resolve('/login'));

      if (path === '/login' && user) goto(resolve('/app'));
    }
  });
</script>

{#if $authStore.loading}
  <div class="flex h-dvh items-center justify-center bg-fc-page text-fc-fg-muted">
    <Spinner />
  </div>
{:else}
  {@render children()}
{/if}

<Toaster class="pb-28 md:pb-6" />
