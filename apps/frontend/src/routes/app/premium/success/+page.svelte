<script lang="ts">
  import { resolve } from '$app/paths';
  import { trpc } from '$lib/trpc';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import confetti from 'canvas-confetti';

  let pageLoading = true;
  let actionLoading = false;
  let subscriptionStatus  = null;
  let error = '';

  onMount(async () => {
    if (!browser) return;

    try {
      subscriptionStatus = await trpc.stripe.getSubscription.query();

      if (subscriptionStatus?.isPremium) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#4f46e5', '#10b981', '#fbbf24']
        });
      }
    } catch {
      error = 'Impossible de vérifier votre nouvel abonnement.';
    } finally {
      pageLoading = false;
    }
  });

  async function handleManageSubscription() {
    if (!browser) return;
    actionLoading = true;
    error = '';
    try {
      const result = await trpc.stripe.createPortalSession.mutate();
      if (result.url) {
        window.location.href = result.url;
      } else {
        error = 'Error accessing customer portal.';
        actionLoading = false;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unable to manage subscription.';
      actionLoading = false;
    }
  }
</script>

<div class="max-w-[1600px] mx-auto px-6 py-6">
  <div class="max-w-md mx-auto space-y-6">
    <div class="space-y-1 text-center">
      <h1 class="text-2xl font-bold tracking-tight text-foreground">Félicitations</h1>
      <p class="text-sm text-muted-foreground">Votre accès Premium est maintenant activé.</p>
    </div>

    {#if error}
      <div class="rounded-xl border border-border bg-destructive/10 p-4 flex items-center gap-3">
        <iconify-icon icon="solar:shield-warning-linear" class="text-destructive" width="20"></iconify-icon>
        <p class="text-sm font-medium text-destructive">{error}</p>
      </div>
    {/if}

    {#if pageLoading}
      <div class="text-center py-12">
        <div class="inline-block animate-spin rounded-full h-6 w-6 border-2 border-border border-t-foreground"></div>
        <p class="mt-2 text-sm text-muted-foreground">Mise à jour de votre compte...</p>
      </div>
    {:else if subscriptionStatus}
      <div class="rounded-xl border border-border bg-card p-6 space-y-5">

        <div class="text-center space-y-2">
          <iconify-icon icon="solar:verified-check-linear" class="text-foreground" width="32"></iconify-icon>
          <h2 class="text-lg font-semibold text-foreground">Abonnement Confirmé</h2>
        </div>

        <div class="rounded-lg border border-border bg-muted/50 p-4 text-sm space-y-2 text-foreground">
          <div class="flex justify-between border-b border-border pb-2">
            <span class="text-muted-foreground">Statut</span>
            <span class="font-medium capitalize">Actif</span>
          </div>

          {#if subscriptionStatus.subscription?.currentPeriodEnd}
            <div class="flex justify-between pt-1">
              <span class="text-muted-foreground">Prochaine facturation</span>
              <span class="font-medium">
                {new Date(subscriptionStatus.subscription.currentPeriodEnd).toLocaleDateString()}
              </span>
            </div>
          {/if}
        </div>

        <div class="space-y-2">
          <a
            href={resolve('/')}
            class="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
          >
            Accéder au Dashboard
          </a>

          <button
            on:click={handleManageSubscription}
            disabled={actionLoading}
            class="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {#if actionLoading}
              <iconify-icon icon="line-md:loading-loop" width="16"></iconify-icon>
            {:else}
              <iconify-icon icon="solar:settings-linear" width="16"></iconify-icon>
            {/if}
            Gérer mon abonnement
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>
