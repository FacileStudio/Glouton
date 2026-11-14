<script lang="ts">
  import { resolve } from '$app/paths';
  import {
    Button,
    FeatureSplit,
    LANDING_HEADING,
    LandingCta,
    LandingFooter,
    LandingHeader,
    PricingPlans,
    SignInWithFacile,
    WorksWith,
    icons,
    type FeatureItem,
    type WorksWithApp
  } from '@facile/muse';
  import authStore from '$lib/auth-store';
  import BulleTile from '$lib/components/landing/BulleTile.svelte';
  import CreationsTile from '$lib/components/landing/CreationsTile.svelte';
  import HuntDemo from '$lib/components/landing/HuntDemo.svelte';
  import WatchTile from '$lib/components/landing/WatchTile.svelte';
  import { marks } from '$lib/components/landing/icons';
  import { useT } from '$lib/i18n';

  const t = useT();
  const shell = 'mx-auto w-full max-w-5xl px-4 sm:px-6';

  const features: FeatureItem[] = $derived([
    { icon: 'solar:map-point-search-linear', title: t('landing.f1.title'), text: t('landing.f1.desc') },
    { icon: 'solar:fire-linear', title: t('landing.f2.title'), text: t('landing.f2.desc') },
    { icon: icons.eye, title: t('landing.f3.title'), text: t('landing.f3.desc') },
    { icon: icons.mail, title: t('landing.f4.title'), text: t('landing.f4.desc') }
  ]);

  const suite: WorksWithApp[] = $derived([
    { name: 'Bulle', icon: marks.bulle, line: t('landing.with.bulle'), href: 'https://bulle.facile.studio' },
    { name: 'Courrier', icon: marks.courrier, line: t('landing.with.courrier'), href: 'https://courrier.facile.studio' },
    { name: 'Ardoise', icon: marks.ardoise, line: t('landing.with.ardoise'), href: 'https://ardoise.facile.studio' }
  ]);
</script>

<svelte:head>
  <title>{t('landing.metaTitle')}</title>
</svelte:head>

{#snippet openApp(size: 'md' | 'lg')}
  <Button {size} href={resolve('/app')} iconRight={size === 'lg' ? icons.arrow : undefined}>{t('landing.openApp')}</Button>
{/snippet}

{#snippet cta()}
  {#if $authStore.session}
    {@render openApp('lg')}
  {:else}
    <LandingCta align="center" />
  {/if}
{/snippet}

<div class="min-h-dvh overflow-x-clip bg-fc-page text-fc-fg">
  <LandingHeader
    appName={t('app.name')}
    icon={marks.glouton}
    links={[
      { label: t('landing.features'), href: '#features' },
      { label: t('landing.pricing'), href: '#tarifs' }
    ]}
    skipHref="#main"
  >
    {#snippet actions()}
      {#if $authStore.session}{@render openApp('md')}{:else}<SignInWithFacile />{/if}
    {/snippet}
  </LandingHeader>

  <main id="main">
    <section class="{shell} pt-20 pb-12 text-center sm:pt-24">
      <h1 class="font-fc-title text-fc-3xl font-bold tracking-tight sm:text-5xl">{t('landing.tagline')}</h1>
      <p class="mx-auto mt-6 max-w-xl text-fc-md text-fc-fg-muted">{t('landing.heroText')}</p>
      <div class="mt-10 flex justify-center">
        {@render cta()}
      </div>
      {#if !$authStore.session}<p class="mt-4 text-fc-sm text-fc-fg-muted">{t('landing.heroPlan')}</p>{/if}
    </section>

    <section class="{shell} pb-8">
      <HuntDemo />
    </section>

    <section class="{shell} relative py-16 sm:py-20">
      <h2 class="mb-10 text-center {LANDING_HEADING}">{t('landing.tiles.title')}</h2>
      <div class="grid gap-6 md:grid-cols-3">
        <CreationsTile />
        <WatchTile />
        <BulleTile />
      </div>
    </section>

    <FeatureSplit
      id="features"
      class="{shell} scroll-mt-20 py-16 md:py-20"
      title={t('landing.featuresTitle')}
      description={t('landing.featuresText')}
      {features}
    />

    <div id="tarifs" class="hidden scroll-mt-20 has-[section]:block">
      <PricingPlans
        class="{shell} py-20"
        title={t('landing.pricing')}
        headingClass={LANDING_HEADING}
        highlight={['glouton.access']}
        highlightOnly
        recommended="pro"
        suiteHref="https://suite.facile.studio/#tarifs"
        suiteNote={t('landing.pricingNote')}
      />
    </div>

    <section class="{shell} py-20 text-center">
      <h2 class={LANDING_HEADING}>{t('landing.cta.title')}</h2>
      <div class="mt-8 flex justify-center">
        {@render cta()}
      </div>
    </section>

    <WorksWith class="{shell} pb-20" apps={suite} />
  </main>

  <LandingFooter appName={t('app.name')} icon={marks.glouton} tagline={t('landing.footerTagline')} />
</div>
