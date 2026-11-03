<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Alert, Button, Field, Input } from '@facile/muse';
  import authStore from '$lib/auth-store';
  import { trpc } from '$lib/trpc';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';

  const tabClass =
    'flex-1 rounded-fc-md py-1.5 text-center text-fc-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring';

  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let firstName = $state('');
  let lastName = $state('');
  let loading = $state(false);
  let error = $state('');

  async function handleRegister() {
    if (password !== confirmPassword) {
      error = 'Les mots de passe ne correspondent pas.';
      return;
    }
    loading = true;
    error = '';
    try {
      const result = await trpc.auth.register.mutate({
        email,
        password,
        confirmPassword,
        firstName,
        lastName,
      });
      authStore.setAuth({ token: result.token }, result.user);
      await goto(resolve('/app/leads'));
    } catch (err) {
      console.error('Registration error:', err);
      error = getTrpcErrorMessage(err);
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Créer un compte — Glouton</title>
</svelte:head>

<div class="flex min-h-dvh bg-fc-page text-fc-fg">
  <aside class="hidden flex-col border-r border-fc-border bg-black px-12 py-10 lg:flex lg:w-1/2">
    <a href={resolve('/')} class="mb-auto flex items-center gap-3">
      <iconify-icon icon="solar:magnet-wave-bold-duotone" width="24" height="24" class="block shrink-0 text-white"></iconify-icon>
      <span class="font-fc-title text-fc-xl font-semibold tracking-tight text-white">Glouton</span>
    </a>

    <div class="mb-auto">
      <h2 class="font-fc-title text-fc-3xl leading-tight font-semibold tracking-tight text-white">
        Créer un pipeline<br />qui reste lisible.
      </h2>
      <p class="mt-4 max-w-xs text-fc-sm leading-relaxed text-white/50">
        Inscription courte. Prospection longue. Mauvais ratio pour les formulaires, bon ratio pour le business.
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
        <h1 class="font-fc-title text-fc-2xl font-semibold tracking-tight">Créer un compte</h1>
        <p class="mt-1.5 text-fc-sm text-fc-fg-muted">
          Créez votre accès à l'espace de prospection.
        </p>
      </div>

      <div class="mb-6 flex gap-1 rounded-fc-lg border border-fc-border bg-fc-surface p-1">
        <a
          href={resolve('/login')}
          class="{tabClass} text-fc-fg-muted hover:text-fc-fg"
        >Connexion</a>
        <a
          href={resolve('/register')}
          aria-current="page"
          class="{tabClass} bg-fc-page text-fc-fg shadow-sm"
        >Inscription</a>
      </div>

      <form
        class="space-y-4"
        onsubmit={(event) => {
          event.preventDefault();
          void handleRegister();
        }}
      >
        <div class="grid gap-4 sm:grid-cols-2">
          <Field label="Prénom" for="firstName">
            <Input
              id="firstName"
              type="text"
              bind:value={firstName}
              placeholder="Yann"
              autocomplete="given-name"
              required
              disabled={loading}
            />
          </Field>
          <Field label="Nom" for="lastName">
            <Input
              id="lastName"
              type="text"
              bind:value={lastName}
              placeholder="Facile"
              autocomplete="family-name"
              required
              disabled={loading}
            />
          </Field>
        </div>

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
            autocomplete="new-password"
            required
            disabled={loading}
          />
        </Field>

        <Field label="Confirmation" for="confirmPassword">
          <Input
            id="confirmPassword"
            type="password"
            bind:value={confirmPassword}
            placeholder="••••••••"
            autocomplete="new-password"
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
          disabled={loading || !firstName || !lastName || !email || !password || !confirmPassword}
          class="w-full rounded-fc-md"
        >
          {loading ? 'Création…' : 'Créer le compte'}
        </Button>
      </form>

      <div class="mt-5 text-fc-sm">
        <a
          href={resolve('/')}
          class="text-fc-fg-muted underline-offset-4 hover:text-fc-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring"
        >
          Accueil
        </a>
      </div>
    </div>
  </main>
</div>
