<script lang="ts">
  import { resolve } from '$app/paths';
  import { Button, LandingFooter, LandingHeader, PricingPlans, SignInWithFacile, icons } from '@facile/muse';
  import authStore from '$lib/auth-store';
  import { useT } from '$lib/i18n';
  import type { Key } from '$lib/i18n/rows';

  const t = useT();
  const features = [
    { icon: 'solar:radar-2-linear', n: 'f1' },
    { icon: 'solar:chart-2-linear', n: 'f2' },
    { icon: 'solar:letter-linear', n: 'f3' }
  ] as const;
  const metrics = ['m1', 'm2', 'm3'] as const;
</script>

<div class="min-h-dvh bg-fc-page text-fc-fg">
  <LandingHeader
    appName={t('app.name')}
    icon="solar:magnet-wave-bold-duotone"
    links={[{ label: t('landing.pricing'), href: '#tarifs' }]}
    skipHref="#main"
  >
    {#snippet actions()}
      {#if $authStore.session}
        <Button href={resolve('/app')}>{t('landing.openApp')}</Button>
      {:else}
        <SignInWithFacile />
      {/if}
    {/snippet}
  </LandingHeader>

  <main id="main">
    <section class="mx-auto max-w-5xl px-4 py-24 text-center sm:px-6">
      <h1 class="font-fc-title text-fc-3xl font-semibold tracking-tight">{t('landing.tagline')}</h1>
      <p class="mx-auto mt-6 max-w-xl text-fc-md leading-relaxed text-fc-fg-muted">{t('landing.heroText')}</p>

      <div class="mt-10 flex justify-center">
        {#if $authStore.session}
          <Button size="lg" href={resolve('/app')} iconRight={icons.arrow}>{t('landing.openApp')}</Button>
        {:else}
          <SignInWithFacile />
        {/if}
      </div>
    </section>

    <section class="mx-auto max-w-5xl px-4 py-20 sm:px-6">
      <div class="grid gap-6 md:grid-cols-3">
        {#each features as feature (feature.n)}
          <article class="rounded-fc-lg bg-fc-component p-6">
            <div class="mb-5 flex size-10 items-center justify-center rounded-fc-md bg-fc-surface">
              <iconify-icon icon={feature.icon} width="20" height="20" class="block shrink-0"></iconify-icon>
            </div>
            <h2 class="text-fc-lg font-semibold">{t(`landing.${feature.n}.title` as Key)}</h2>
            <p class="mt-2 text-fc-sm leading-relaxed text-fc-fg-muted">{t(`landing.${feature.n}.desc` as Key)}</p>
          </article>
        {/each}
      </div>
    </section>

    <section class="mx-auto grid max-w-5xl gap-6 px-4 py-20 sm:px-6 md:grid-cols-[1fr_1.2fr] md:items-center">
      <div>
        <h2 class="font-fc-title text-fc-2xl font-semibold tracking-tight">{t('landing.truth.title')}</h2>
        <p class="mt-4 text-fc-fg-muted">{t('landing.truth.text')}</p>
      </div>
      <div class="flex flex-col gap-2 rounded-fc-lg bg-fc-component p-2">
        {#each metrics as metric (metric)}
          <div class="flex items-center justify-between gap-4 rounded-fc-md bg-fc-surface px-5 py-4">
            <span class="font-medium">{t(`landing.${metric}.k` as Key)}</span>
            <span class="text-right text-fc-sm text-fc-fg-muted">{t(`landing.${metric}.v` as Key)}</span>
          </div>
        {/each}
      </div>
    </section>

    <div id="tarifs" class="hidden has-[section]:block">
      <div class="mx-auto max-w-5xl px-4 py-20 sm:px-6">
        <PricingPlans title={t('landing.pricing')} highlight={['glouton.access']} />
        <p class="mt-8 text-center text-fc-sm text-fc-fg-muted">{t('landing.pricingNote')}</p>
      </div>
    </div>
  </main>

  <LandingFooter appName={t('app.name')} icon="solar:magnet-wave-bold-duotone" tagline={t('landing.footerTagline')} />
</div>
