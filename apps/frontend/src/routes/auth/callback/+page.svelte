<script lang="ts">
  import { UserRole } from '@repo/types';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Spinner } from '@facile/muse';
  import authStore from '$lib/auth-store';

  let error = $state('');

  function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
      const payload = token.split('.')[1];
      if (!payload) return null;
      const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  onMount(async () => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const token = hash.get('token');
    history.replaceState(null, '', window.location.pathname);

    const payload = token ? decodeJwtPayload(token) : null;
    if (!token || !payload?.id || !payload?.email) {
      error = 'Connexion SSO échouée. Veuillez réessayer.';
      return;
    }

    authStore.setAuth(
      { token },
      {
        id: payload.id as string,
        email: payload.email as string,
        firstName: (payload.firstName as string) ?? '',
        lastName: (payload.lastName as string) ?? '',
        role: payload.role === UserRole.ADMIN ? UserRole.ADMIN : UserRole.USER,
        isPremium: Boolean(payload.isPremium),
        avatarUrl: (payload.avatarUrl as string | null) ?? null,
        coverImageUrl: null,
      }
    );

    await goto(resolve('/app/leads'));
  });
</script>

<svelte:head>
  <title>Connexion — Glouton</title>
</svelte:head>

<div class="flex min-h-dvh flex-col items-center justify-center gap-4 bg-fc-page px-4 text-fc-fg">
  {#if error}
    <p role="alert" class="text-fc-sm text-fc-danger">{error}</p>
    <a
      href={resolve('/login')}
      class="text-fc-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring"
    >
      Retour à la connexion
    </a>
  {:else}
    <Spinner label="Connexion en cours" />
    <p class="text-fc-sm text-fc-fg-muted">Connexion en cours…</p>
  {/if}
</div>
