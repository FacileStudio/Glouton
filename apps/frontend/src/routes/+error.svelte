<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import 'iconify-icon';

  $: status = $page.status;
  $: message = $page.error?.message || 'Something went wrong';

  function goHome() {
    goto(resolve('/'));
  }

  function goBack() {
    window.history.back();
  }
</script>

<div class="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
  <div class="mx-auto w-full max-w-md text-center">
    <p class="text-sm text-muted-foreground">Erreur {status}</p>
    <h1 class="mt-2 text-5xl font-bold tracking-tight md:text-6xl">
      {#if status === 404}
        Page introuvable
      {:else if status === 500}
        Erreur interne
      {:else}
        Une erreur est survenue
      {/if}
    </h1>

    <p class="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
      {#if status === 404}
        La page demandée n'existe pas ou a été déplacée.
      {:else if status === 500}
        Nos serveurs rencontrent un souci. Réessayez dans quelques instants.
      {:else}
        {message}
      {/if}
    </p>

    <div class="mt-8 flex flex-col items-center justify-center gap-2 sm:flex-row">
      <button
        on:click={goHome}
        class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
      >
        <iconify-icon icon="solar:home-2-linear" width="16"></iconify-icon>
        Accueil
      </button>
      <button
        on:click={goBack}
        class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
      >
        <iconify-icon icon="solar:arrow-left-linear" width="16"></iconify-icon>
        Retour
      </button>
    </div>
  </div>
</div>
