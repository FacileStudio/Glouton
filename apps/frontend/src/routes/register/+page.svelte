<script lang="ts">
  import authStore from '$lib/auth-store';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { trpc } from '$lib/trpc';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import 'iconify-icon';

  let step = 1;
  let email = '';
  let password = '';
  let confirmPassword = '';
  let firstName = '';
  let lastName = '';
  let loading = false;
  let error = '';

  const steps = ['Identité', 'Email', 'Sécurité'];

  function nextStep() {
    error = '';
    if (step === 1 && firstName && lastName) step = 2;
    else if (step === 2 && email) step = 3;
  }

  function prevStep() {
    error = '';
    if (step > 1) step -= 1;
    else void goto(resolve('/login'));
  }

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
      authStore.setAuth({ token: result.token }, result.user as any);
      await goto(resolve('/app/leads'));
    } catch (err: any) {
      console.error('Registration error:', err);
      error = getTrpcErrorMessage(err);
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Créer un compte — Glouton</title>
</svelte:head>

<div class="flex min-h-screen bg-background text-foreground">
  <aside class="hidden w-1/2 flex-col bg-foreground px-12 py-10 text-background lg:flex">
    <a href={resolve('/')} class="mb-auto flex items-center gap-3">
      <iconify-icon icon="solar:magnet-wave-bold-duotone" width="28"></iconify-icon>
      <span class="text-xl font-bold">Glouton</span>
    </a>

    <div class="mb-auto">
      <h1 class="text-4xl font-bold leading-tight">
        Créer un pipeline<br />qui reste lisible.
      </h1>
      <p class="mt-4 max-w-xs text-sm leading-relaxed text-background/55">
        Inscription courte. Prospection longue. Mauvais ratio pour les formulaires, bon ratio pour le business.
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
        <div class="mb-4 grid grid-cols-3 gap-2">
          {#each steps as item, index}
            <div class="h-1 rounded-full {index + 1 <= step ? 'bg-foreground' : 'bg-muted'}"></div>
          {/each}
        </div>
        <p class="text-sm text-muted-foreground">Étape {step} sur 3 — {steps[step - 1]}</p>
        <h2 class="mt-1.5 text-2xl font-bold">
          {#if step === 1}
            Votre identité
          {:else if step === 2}
            Votre email
          {:else}
            Votre accès
          {/if}
        </h2>
      </div>

      {#if step === 1}
        <form
          class="space-y-4"
          onsubmit={(event) => {
            event.preventDefault();
            nextStep();
          }}
        >
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="space-y-1.5 block">
              <span class="text-sm font-medium">Prénom</span>
              <input
                bind:value={firstName}
                placeholder="Yann"
                class="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                required
              />
            </label>
            <label class="space-y-1.5 block">
              <span class="text-sm font-medium">Nom</span>
              <input
                bind:value={lastName}
                placeholder="Facile"
                class="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                required
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={!firstName || !lastName}
            class="inline-flex h-9 w-full items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:pointer-events-none disabled:opacity-50"
          >
            Continuer
          </button>
        </form>
      {:else if step === 2}
        <form
          class="space-y-4"
          onsubmit={(event) => {
            event.preventDefault();
            nextStep();
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
          <button
            type="submit"
            disabled={!email}
            class="inline-flex h-9 w-full items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:pointer-events-none disabled:opacity-50"
          >
            Continuer
          </button>
        </form>
      {:else}
        <form
          class="space-y-4"
          onsubmit={(event) => {
            event.preventDefault();
            void handleRegister();
          }}
        >
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
          <label class="space-y-1.5 block">
            <span class="text-sm font-medium">Confirmation</span>
            <input
              type="password"
              bind:value={confirmPassword}
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
            disabled={loading || !password || !confirmPassword}
            class="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:pointer-events-none disabled:opacity-50"
          >
            {#if loading}
              <iconify-icon icon="svg-spinners:180-ring" width="16"></iconify-icon>
              Création
            {:else}
              Créer le compte
            {/if}
          </button>
        </form>
      {/if}

      <div class="mt-5 flex items-center justify-between text-sm">
        <button
          type="button"
          onclick={prevStep}
          class="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {step === 1 ? 'Connexion' : 'Précédent'}
        </button>
        <a href={resolve('/login')} class="font-medium underline-offset-4 hover:underline">
          Déjà un compte
        </a>
      </div>
    </div>
  </main>
</div>
