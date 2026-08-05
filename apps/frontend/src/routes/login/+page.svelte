<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { trpc } from '$lib/trpc';
  import authStore from '$lib/auth-store';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import 'iconify-icon';

  const inputClass =
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';
  const labelClass = 'text-sm font-medium leading-none';
  const primaryButtonClass =
    'inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50';
  const outlineButtonClass =
    'inline-flex h-10 w-full items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50';

  let loading = false;
  let error = '';
  let email = '';
  let password = '';
  let ssoOnly = false;
  let oidcEnabled = false;
  let configLoaded = false;

  onMount(async () => {
    try {
      const config = await fetch('/auth/config').then((r) => r.json());
      ssoOnly = config.sso_only ?? false;
      oidcEnabled = config.oidc_enabled ?? false;
    } catch {
      // Backend unreachable or OIDC not configured: keep password login.
    }
    configLoaded = true;
  });

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

<div class="flex min-h-screen">
  <aside class="hidden lg:flex lg:w-1/2 flex-col bg-black px-12 py-10">
    <a href={resolve('/')} class="flex items-center gap-3 mb-auto">
      <iconify-icon icon="solar:magnet-wave-bold-duotone" width="28" class="text-white"></iconify-icon>
      <span class="text-xl font-bold font-heading tracking-tight text-white">Glouton</span>
    </a>

    <div class="mb-auto">
      <h2 class="text-4xl font-bold font-heading text-white leading-tight tracking-tight">
        Trouver. Qualifier.<br />Prospecter.
      </h2>
      <p class="mt-4 text-sm text-white/50 max-w-xs leading-relaxed">
        L'espace de prospection propre pour les pistes Facile.
      </p>
    </div>

    <p class="text-xs text-white/30">© {new Date().getFullYear()} Glouton par Facile.</p>
  </aside>

  <main class="flex w-full lg:w-1/2 flex-col items-center justify-center px-8 py-12 bg-background">
    <div class="w-full max-w-sm">
      <a href={resolve('/')} class="mb-10 flex items-center gap-3 lg:hidden">
        <iconify-icon icon="solar:magnet-wave-bold-duotone" width="28"></iconify-icon>
        <span class="text-xl font-bold font-heading tracking-tight">Glouton</span>
      </a>

      <div class="mb-8">
        <h1 class="text-2xl font-bold font-heading tracking-tight text-foreground">Bon retour</h1>
        <p class="mt-1.5 text-sm text-muted-foreground">
          {ssoOnly
            ? 'Connectez-vous avec votre compte organisation.'
            : 'Connectez-vous à votre espace de prospection.'}
        </p>
      </div>

      {#if !configLoaded}
        <div class="h-40"></div>
      {:else}
        {#if !ssoOnly}
          <div class="mb-6 flex rounded-lg border border-border bg-muted p-1 gap-1">
            <a
              href={resolve('/login')}
              aria-current="page"
              class="flex-1 rounded-md py-1.5 text-center text-sm font-medium transition-colors bg-background text-foreground shadow-sm"
            >Connexion</a>
            <a
              href={resolve('/register')}
              class="flex-1 rounded-md py-1.5 text-center text-sm font-medium transition-colors text-muted-foreground hover:text-foreground"
            >Inscription</a>
          </div>

          <form
            class="space-y-4"
            onsubmit={(event) => {
              event.preventDefault();
              void handleLogin();
            }}
          >
            <div class="space-y-1.5">
              <label for="email" class={labelClass}>Email</label>
              <input
                id="email"
                type="email"
                bind:value={email}
                placeholder="vous@entreprise.com"
                autocomplete="email"
                required
                disabled={loading}
                class={inputClass}
              />
            </div>

            <div class="space-y-1.5">
              <label for="password" class={labelClass}>Mot de passe</label>
              <input
                id="password"
                type="password"
                bind:value={password}
                placeholder="••••••••"
                autocomplete="current-password"
                required
                disabled={loading}
                class={inputClass}
              />
            </div>

            {#if error}
              <p class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            {/if}

            <button
              type="submit"
              disabled={loading || !email || !password}
              class={primaryButtonClass}
            >
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>
        {/if}

        {#if oidcEnabled}
          {#if !ssoOnly}
            <div class="my-5 flex items-center gap-3">
              <div class="h-px flex-1 bg-border"></div>
              <span class="text-xs text-muted-foreground">ou</span>
              <div class="h-px flex-1 bg-border"></div>
            </div>
          {/if}

          <a href="/auth/oidc" data-sveltekit-reload class="block">
            <button type="button" class={outlineButtonClass}>Continuer avec SSO</button>
          </a>
        {/if}

        <div class="mt-5 text-sm">
          <a href={resolve('/')} class="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Accueil
          </a>
        </div>
      {/if}
    </div>
  </main>
</div>
