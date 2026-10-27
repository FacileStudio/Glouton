<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Alert, Button, Field, Input } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import authStore from '$lib/auth-store';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';

  const tabClass =
    'flex-1 rounded-fc-md py-1.5 text-center text-fc-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring';
  let loading = $state(false);
  let error = $state('');
  let email = $state('');
  let password = $state('');
  let ssoOnly = $state(false);
  let oidcEnabled = $state(false);
  let configLoaded = $state(false);

  onMount(async () => {
    try {
      const config = await fetch('/auth/config').then((r) => r.json());
      ssoOnly = config.sso_only ?? false;
      oidcEnabled = config.oidc_enabled ?? false;
    } catch {}
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

<div class="flex min-h-dvh bg-fc-page text-fc-fg">
  <aside class="hidden flex-col border-r border-fc-border bg-black px-12 py-10 lg:flex lg:w-1/2">
    <a href={resolve('/')} class="mb-auto flex items-center gap-3">
      <iconify-icon icon="solar:magnet-wave-bold-duotone" width="24" height="24" class="block shrink-0 text-white"></iconify-icon>
      <span class="font-fc-title text-fc-xl font-semibold tracking-tight text-white">Glouton</span>
    </a>

    <div class="mb-auto">
      <h2 class="font-fc-title text-fc-3xl leading-tight font-semibold tracking-tight text-white">
        Trouver. Qualifier.<br />Prospecter.
      </h2>
      <p class="mt-4 max-w-xs text-fc-sm leading-relaxed text-white/50">
        L'espace de prospection propre pour les pistes Facile.
      </p>
    </div>

    <p class="text-fc-xs text-white/30">© {new Date().getFullYear()} Glouton par Facile.</p>
  </aside>

  <main class="flex w-full flex-col items-center justify-center px-4 py-12 sm:px-8 lg:w-1/2">
    <div class="w-full max-w-sm">
      <a href={resolve('/')} class="mb-10 flex items-center gap-3 lg:hidden">
        <iconify-icon icon="solar:magnet-wave-bold-duotone" width="24" height="24" class="block shrink-0"></iconify-icon>
        <span class="font-fc-title text-fc-xl font-semibold tracking-tight">Glouton</span>
      </a>

      <div class="mb-8">
        <h1 class="font-fc-title text-fc-2xl font-semibold tracking-tight">Bon retour</h1>
        <p class="mt-1.5 text-fc-sm text-fc-fg-muted">
          {ssoOnly
            ? 'Connectez-vous avec votre compte Facile.'
            : 'Connectez-vous à votre espace de prospection.'}
        </p>
      </div>

      {#if !configLoaded}
        <div class="h-40"></div>
      {:else}
        {#if oidcEnabled}
          <Button
            href="/auth/oidc"
            data-sveltekit-reload
            size="lg"
            icon="solar:key-minimalistic-square-bold-duotone"
            class="w-full rounded-fc-md"
          >
            Se connecter avec Facile
          </Button>
          {#if !ssoOnly}
            <div class="my-6 flex items-center gap-3">
              <span class="h-px flex-1 bg-fc-border"></span>
              <span class="text-fc-xs text-fc-fg-muted">ou</span>
              <span class="h-px flex-1 bg-fc-border"></span>
            </div>
          {/if}
        {/if}

        {#if !ssoOnly}
          <div class="mb-6 flex gap-1 rounded-fc-lg border border-fc-border bg-fc-surface p-1">
            <a
              href={resolve('/login')}
              aria-current="page"
              class="{tabClass} bg-fc-page text-fc-fg shadow-sm"
            >Connexion</a>
            <a
              href={resolve('/register')}
              class="{tabClass} text-fc-fg-muted hover:text-fc-fg"
            >Inscription</a>
          </div>

          <form
            class="space-y-4"
            onsubmit={(event) => {
              event.preventDefault();
              void handleLogin();
            }}
          >
            <Field label="Email" for="email">
              <Input
                id="email"
                type="email"
                bind:value={email}
                placeholder="vous@entreprise.com"
                autocomplete="email"
                required
                disabled={loading}
              />
            </Field>

            <Field label="Mot de passe" for="password">
              <Input
                id="password"
                type="password"
                bind:value={password}
                placeholder="••••••••"
                autocomplete="current-password"
                required
                disabled={loading}
              />
            </Field>

            {#if error}
              <Alert tone="danger">{error}</Alert>
            {/if}

            <Button
              type="submit"
              size="lg"
              disabled={loading || !email || !password}
              class="w-full rounded-fc-md"
            >
              {loading ? 'Connexion…' : 'Se connecter'}
            </Button>
          </form>
        {/if}

        <div class="mt-5 text-fc-sm">
          <a
            href={resolve('/')}
            class="text-fc-fg-muted underline-offset-4 hover:text-fc-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring"
          >
            Accueil
          </a>
        </div>
      {/if}
    </div>
  </main>
</div>
