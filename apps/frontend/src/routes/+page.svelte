<script lang="ts">
  import { resolve } from '$app/paths';
  import { Button, LandingFooter, LandingHeader, PricingPlans, SignInWithFacile, icons } from '@facile/muse';
  import authStore from '$lib/auth-store';
  import HuntDemo from '$lib/components/landing/HuntDemo.svelte';
  import { useT } from '$lib/i18n';
  import type { Key } from '$lib/i18n/rows';

  const t = useT();
  const features = [
    { icon: 'solar:map-point-search-linear', n: 'f1' },
    { icon: 'solar:fire-linear', n: 'f2' },
    { icon: 'solar:eye-linear', n: 'f3' },
    { icon: 'solar:letter-linear', n: 'f4' }
  ] as const;
</script>

{#snippet cta(size: 'md' | 'lg')}
  {#if $authStore.session}
    <Button {size} href={resolve('/app')} iconRight={size === 'lg' ? icons.arrow : undefined}>{t('landing.openApp')}</Button>
  {:else}
    <SignInWithFacile />
  {/if}
{/snippet}

<div class="min-h-dvh overflow-x-clip bg-fc-page text-fc-fg">
  <LandingHeader
    appName={t('app.name')}
    icon="solar:magnet-wave-bold-duotone"
    links={[
      { label: t('landing.features'), href: '#features' },
      { label: t('landing.pricing'), href: '#tarifs' }
    ]}
    skipHref="#main"
  >
    {#snippet actions()}
      {@render cta('md')}
    {/snippet}
  </LandingHeader>

  <main id="main">
    <section class="mx-auto max-w-5xl px-4 pt-20 pb-12 text-center sm:px-6 sm:pt-24">
      <h1 class="font-fc-title text-fc-3xl font-bold tracking-tight sm:text-5xl">{t('landing.tagline')}</h1>
      <p class="mx-auto mt-6 max-w-xl text-fc-md text-fc-fg-muted">{t('landing.heroText')}</p>
      <div class="mt-10 flex justify-center">
        {@render cta('lg')}
      </div>
    </section>

    <section class="mx-auto max-w-5xl px-4 pb-8 sm:px-6">
      <HuntDemo />
    </section>

    <section id="features" class="mx-auto max-w-5xl scroll-mt-20 px-4 py-12 sm:px-6">
      <ul class="grid gap-4 sm:grid-cols-2">
        {#each features as feature (feature.n)}
          <li class="rounded-fc-lg bg-fc-component p-6">
            <div class="mb-4 flex size-10 items-center justify-center rounded-fc-md bg-fc-surface">
              <iconify-icon icon={feature.icon} width="20" height="20" class="block shrink-0"></iconify-icon>
            </div>
            <h2 class="text-fc-lg font-bold">{t(`landing.${feature.n}.title` as Key)}</h2>
            <p class="mt-1.5 text-fc-sm text-fc-fg-muted">{t(`landing.${feature.n}.desc` as Key)}</p>
          </li>
        {/each}
      </ul>
    </section>

    <div id="tarifs" class="hidden scroll-mt-20 has-[section]:block">
      <div class="mx-auto max-w-5xl px-4 py-20 sm:px-6">
        <PricingPlans title={t('landing.pricing')} highlight={['glouton.access']} />
        <p class="mt-8 text-center text-fc-sm text-fc-fg-muted">{t('landing.pricingNote')}</p>
      </div>
    </div>

    <section class="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6">
      <h2 class="font-fc-title text-fc-2xl font-bold tracking-tight">{t('landing.cta.title')}</h2>
      <div class="mt-8 flex justify-center">
        {@render cta('lg')}
      </div>
    </section>
  </main>

  <LandingFooter appName={t('app.name')} icon="solar:magnet-wave-bold-duotone" tagline={t('landing.footerTagline')} />
</div>
