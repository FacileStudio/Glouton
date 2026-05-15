<script lang="ts">
  import { resolve } from '$app/paths';
  import { trpc } from '$lib/trpc';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import env  from '$lib/env';
  import { Button, Spinner, Card, Alert } from '@repo/ui';
  import { toast } from '@repo/utils';
  import 'iconify-icon';

  let pageLoading = true;
  let actionLoading = false;
  let subscriptionStatus = null;

  $: canceled = $page.url.searchParams.get('canceled') === 'true';

  const PREMIUM_PRICE_ID = env.STRIPE_PRICE_ID;

  onMount(async () => {
    if (!browser) return;

    try {
      subscriptionStatus = await trpc.stripe.getSubscription.query();
    } catch {
      toast.push('Impossible de charger le statut de l\'abonnement.', 'error');
    } finally {
      pageLoading = false;
    }
  });

  async function handleBecomePremium() {
    if (!browser) return;
    actionLoading = true;
    try {
      const result = await trpc.stripe.createCheckoutSession.mutate({ priceId: PREMIUM_PRICE_ID });
      if (result.url) {
        window.location.href = result.url;
      } else {
        toast.push('Error creating payment session.', 'error');
        actionLoading = false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize Premium.';
      toast.push(errorMessage, 'error');
      actionLoading = false;
    }
  }

  async function handleManageSubscription() {
    if (!browser) return;
    actionLoading = true;
    try {
      const result = await trpc.stripe.createPortalSession.mutate();
      if (result.url) {
        window.location.href = result.url;
      } else {
        toast.push('Error accessing customer portal.', 'error');
        actionLoading = false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to manage subscription.';
      toast.push(errorMessage, 'error');
      actionLoading = false;
    }
  }
</script>

<div class="max-w-[1600px] mx-auto px-6 py-6">
  <div class="max-w-md mx-auto space-y-6">
    <div class="space-y-1 text-center">
      <h1 class="text-2xl font-bold tracking-tight text-foreground">Premium Membership</h1>
      <p class="text-sm text-muted-foreground">Débloquez les fonctionnalités exclusives</p>
    </div>

    {#if canceled}
      <Alert variant="warning">
        Le paiement n'a pas été finalisé.
      </Alert>
    {/if}

    {#if pageLoading}
      <div class="text-center py-12">
        <Spinner size="lg" />
        <p class="mt-2 text-sm text-muted-foreground">Vérification de votre statut...</p>
      </div>
    {:else if subscriptionStatus}
      <div class="rounded-xl border border-border bg-card p-6 space-y-5">

        {#if subscriptionStatus.isPremium}
          <div class="text-center space-y-2">
            <iconify-icon icon="solar:verified-check-linear" class="text-foreground" width="32"></iconify-icon>
            <h2 class="text-lg font-semibold text-foreground">Vous êtes Premium</h2>
          </div>

          <div class="rounded-lg border border-border bg-muted/50 p-4 text-sm space-y-2 text-foreground">
            {#if subscriptionStatus.subscription?.status}
              <div class="flex justify-between border-b border-border pb-2">
                <span class="text-muted-foreground">Statut</span>
                <span class="font-medium capitalize">{subscriptionStatus.subscription.status}</span>
              </div>
            {/if}

            {#if subscriptionStatus.subscription?.currentPeriodEnd}
              <div class="flex justify-between pt-1">
                <span class="text-muted-foreground">Renouvellement</span>
                <span class="font-medium">
                  {new Date(subscriptionStatus.subscription.currentPeriodEnd).toLocaleDateString()}
                </span>
              </div>
            {/if}
          </div>

          <button
            onclick={handleManageSubscription}
            disabled={actionLoading}
            class="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50"
          >
            {#if actionLoading}
              <iconify-icon icon="line-md:loading-loop" width="16"></iconify-icon>
            {:else}
              <iconify-icon icon="solar:settings-linear" width="16"></iconify-icon>
            {/if}
            Gérer mon abonnement
          </button>

        {:else}
          <div class="rounded-lg border border-border bg-muted/50 p-4">
            <ul class="space-y-2 text-foreground text-sm">
              <li class="flex gap-2 items-center"><iconify-icon icon="solar:check-circle-linear" class="text-muted-foreground"></iconify-icon> Accès illimité</li>
              <li class="flex gap-2 items-center"><iconify-icon icon="solar:check-circle-linear" class="text-muted-foreground"></iconify-icon> Support prioritaire</li>
            </ul>
          </div>

          <button
            onclick={handleBecomePremium}
            disabled={actionLoading}
            class="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50"
          >
            {#if actionLoading}
              <iconify-icon icon="line-md:loading-loop" width="16"></iconify-icon>
            {:else}
              <iconify-icon icon="solar:star-linear" width="16"></iconify-icon>
              Devenir Premium
            {/if}
          </button>
        {/if}

        <a href={resolve('/')} class="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <iconify-icon icon="solar:arrow-left-linear" width="16"></iconify-icon> Retour
        </a>
      </div>
    {/if}
  </div>
</div>
