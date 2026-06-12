<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import authStore from '$lib/auth-store';
  import 'iconify-icon';

  let error = '';

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
    // Drop the token from the URL/history as soon as it is read.
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
        role: payload.role as any,
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

<div class="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
  {#if error}
    <p class="text-sm text-destructive">{error}</p>
    <a href={resolve('/login')} class="text-sm font-medium underline-offset-4 hover:underline">
      Retour à la connexion
    </a>
  {:else}
    <iconify-icon icon="svg-spinners:180-ring" width="24"></iconify-icon>
    <p class="text-sm text-muted-foreground">Connexion en cours…</p>
  {/if}
</div>
