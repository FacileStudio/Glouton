<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { trpc } from '$lib/trpc';
  import authStore from '$lib/auth-store';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import 'iconify-icon';

  let loading = false;
  let error = '';
  let email = '';
  let password = '';

  async function handleLogin() {
    loading = true;
    error = '';
    try {
      const result = await trpc.auth.login.mutate({ email, password });
      authStore.setAuth({ token: result.token }, result.user as any);
      await goto(resolve('/app/leads'));
    } catch (err: any) {
      console.error('Login error:', err);
      error = getTrpcErrorMessage(err);
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Connexion — Glouton</title>
</svelte:head>

<div class="flex min-h-screen bg-background text-foreground">
  <aside class="hidden w-1/2 flex-col bg-foreground px-12 py-10 text-background lg:flex">
    <a href={resolve('/')} class="mb-auto flex items-center gap-3">
      <iconify-icon icon="solar:magnet-wave-bold-duotone" width="28"></iconify-icon>
      <span class="text-xl font-bold">Glouton</span>
    </a>

    <div class="mb-auto">
      <h1 class="text-4xl font-bold leading-tight">
        Trouver. Qualifier.<br />Prospecter.
      </h1>
      <p class="mt-4 max-w-xs text-sm leading-relaxed text-background/55">
        L'espace de prospection propre pour les pistes Facile.
      </p>
    </div>

    <p class="text-xs text-background/35">© {new Date().getFullYear()} Glouton by Facile.</p>
  </aside>

  <main class="flex w-full flex-col items-center justify-center px-8 py-12 lg:w-1/2">
    <div class="w-full max-w-sm">
      <a href={resolve('/')} class="mb-10 flex items-center gap-3 lg:hidden">
        <iconify-icon icon="solar:magnet-wave-bold-duotone" width="28"></iconify-icon>
        <span class="text-xl font-bold">Glouton</span>
      </a>

      <div class="mb-8">
        <h2 class="text-2xl font-bold">Bon retour</h2>
        <p class="mt-1.5 text-sm text-muted-foreground">
          Connectez-vous à votre espace de prospection.
        </p>
      </div>

      <form
        class="space-y-4"
        onsubmit={(event) => {
          event.preventDefault();
          void handleLogin();
        }}
      >
        <label class="space-y-1.5 block">
          <span class="text-sm font-medium">Email</span>
          <input
            type="email"
            bind:value={email}
            placeholder="vous@entreprise.com"
            class="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            required
          />
        </label>

        <label class="space-y-1.5 block">
          <span class="text-sm font-medium">Mot de passe</span>
          <input
            type="password"
            bind:value={password}
            placeholder="••••••••"
            class="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            required
          />
        </label>

        {#if error}
          <p class="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        {/if}

        <button
          type="submit"
          disabled={loading || !email || !password}
          class="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:pointer-events-none disabled:opacity-50"
        >
          {#if loading}
            <iconify-icon icon="svg-spinners:180-ring" width="16"></iconify-icon>
            Vérification
          {:else}
            Se connecter
          {/if}
        </button>
      </form>

      <div class="mt-5 flex items-center justify-between text-sm">
        <a href={resolve('/')} class="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Accueil
        </a>
        <a href={resolve('/register')} class="font-medium underline-offset-4 hover:underline">
          Créer un compte
        </a>
      </div>
    </div>
  </main>
</div>
