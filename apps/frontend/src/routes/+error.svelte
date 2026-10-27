<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Button, icons } from '@facile/muse';

  const status = $derived(page.status);
  const message = $derived(page.error?.message || 'Une erreur est survenue');

  function goHome() {
    goto(resolve('/'));
  }

  function goBack() {
    window.history.back();
  }
</script>

<div class="flex min-h-dvh items-center justify-center bg-fc-page px-4 text-fc-fg sm:px-6">
  <div class="mx-auto w-full max-w-md text-center">
    <p class="text-fc-sm text-fc-fg-muted">Erreur {status}</p>
    <h1 class="mt-2 font-fc-title text-fc-3xl font-semibold tracking-tight">
      {#if status === 404}
        Page introuvable
      {:else if status === 500}
        Erreur interne
      {:else}
        Une erreur est survenue
      {/if}
    </h1>

    <p class="mx-auto mt-4 max-w-sm text-fc-sm leading-relaxed text-fc-fg-muted">
      {#if status === 404}
        La page demandée n'existe pas ou a été déplacée.
      {:else if status === 500}
        Nos serveurs rencontrent un souci. Réessayez dans quelques instants.
      {:else}
        {message}
      {/if}
    </p>

    <div class="mt-8 flex flex-col items-center justify-center gap-2 sm:flex-row">
      <Button icon={icons.home} onclick={goHome} class="rounded-fc-md">Accueil</Button>
      <Button variant="outline" icon="solar:arrow-left-linear" onclick={goBack} class="rounded-fc-md">
        Retour
      </Button>
    </div>
  </div>
</div>
