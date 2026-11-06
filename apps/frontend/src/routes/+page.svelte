<script lang="ts">
  import { resolve } from '$app/paths';
  import { Button, Divider, PricingPlans, icons } from '@facile/muse';
  import authStore from '$lib/auth-store';

  const features = [
    {
      icon: 'solar:radar-2-linear',
      title: 'Chercher les bonnes pistes',
      desc: 'Lancez des chasses sur domaines, zones locales ou sources spécialisées, puis laissez Glouton ranger les résultats.'
    },
    {
      icon: 'solar:chart-2-linear',
      title: 'Qualifier sans bruit',
      desc: 'Score, statut, coordonnées, signaux techniques et contexte commercial sont regroupés dans une seule fiche exploitable.'
    },
    {
      icon: 'solar:letter-linear',
      title: 'Préparer la prospection',
      desc: 'Suivez les contacts, les relances et les opportunités prêtes à partir sans transformer le CRM en tableur hanté.'
    }
  ];

  const metrics = [
    ['Sources', 'Domaines, local, plateformes'],
    ['Scoring', 'HOT, WARM, COLD'],
    ['Workflow', 'Audit, tri, outreach']
  ];
</script>

<svelte:head>
  <title>Glouton — Prospection Facile</title>
  <meta
    name="description"
    content="Glouton centralise la recherche, la qualification et la prospection de leads pour Facile."
  />
</svelte:head>

<div class="min-h-dvh bg-fc-page text-fc-fg">
  <header class="border-b border-fc-border">
    <div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
      <a
        href={resolve('/')}
        class="flex h-14 items-center gap-3 rounded-fc-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring"
      >
        <iconify-icon icon="solar:magnet-wave-bold-duotone" width="24" height="24" class="block shrink-0"></iconify-icon>
        <span class="font-fc-title text-fc-xl font-semibold tracking-tight">Glouton</span>
      </a>

      <div class="flex items-center gap-2">
        {#if !$authStore.session}
          <Button variant="ghost" href={resolve('/login')} class="rounded-fc-md">Connexion</Button>
          <Button href={resolve('/register')} class="rounded-fc-md">Commencer</Button>
        {:else}
          <Button href={resolve('/app/leads')} class="rounded-fc-md">Ouvrir l'app</Button>
        {/if}
      </div>
    </div>
  </header>

  <main>
    <section class="mx-auto max-w-5xl px-4 py-24 text-center sm:px-6">
      <h1 class="font-fc-title text-fc-3xl font-semibold tracking-tight">
        Trouver. Qualifier.<br />Prospecter.
      </h1>
      <p class="mx-auto mt-6 max-w-xl text-fc-md leading-relaxed text-fc-fg-muted">
        Glouton transforme les recherches commerciales en pistes propres, priorisées et prêtes à contacter.
      </p>

      <div class="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
        <Button
          size="lg"
          href={resolve($authStore.session ? '/app/leads' : '/register')}
          iconRight={icons.arrow}
          class="rounded-fc-md"
        >
          {$authStore.session ? "Ouvrir l'app" : 'Créer un compte'}
        </Button>
        <Button size="lg" variant="outline" href={resolve('/login')} class="rounded-fc-md">Connexion</Button>
      </div>
    </section>

    <Divider class="my-0" />

    <section class="mx-auto max-w-5xl px-4 py-20 sm:px-6">
      <div class="grid gap-6 md:grid-cols-3">
        {#each features as feature (feature.title)}
          <article class="rounded-fc-lg bg-fc-component p-6">
            <div class="mb-5 flex size-10 items-center justify-center rounded-fc-md bg-fc-surface">
              <iconify-icon icon={feature.icon} width="20" height="20" class="block shrink-0"></iconify-icon>
            </div>
            <h2 class="text-fc-lg font-semibold">{feature.title}</h2>
            <p class="mt-2 text-fc-sm leading-relaxed text-fc-fg-muted">{feature.desc}</p>
          </article>
        {/each}
      </div>
    </section>

    <Divider class="my-0" />

    <section class="mx-auto grid max-w-5xl gap-6 px-4 py-20 sm:px-6 md:grid-cols-[1fr_1.2fr] md:items-center">
      <div>
        <h2 class="font-fc-title text-fc-2xl font-semibold tracking-tight">Une seule table de vérité pour les leads.</h2>
        <p class="mt-4 text-fc-fg-muted">
          Chasses, audits, cartes, qualification, relance: tout converge dans un espace lisible.
        </p>
      </div>
      <div class="divide-y divide-fc-border rounded-fc-lg bg-fc-component">
        {#each metrics as metric (metric[0])}
          <div class="flex items-center justify-between gap-4 px-5 py-4">
            <span class="font-medium">{metric[0]}</span>
            <span class="text-right text-fc-sm text-fc-fg-muted">{metric[1]}</span>
          </div>
        {/each}
      </div>
    </section>

    <div id="tarifs" class="hidden has-[section]:block">
      <Divider class="my-0" />
      <div class="mx-auto max-w-5xl px-4 py-20 sm:px-6">
        <PricingPlans title="Tarifs" highlight={['glouton.access']} />
        <p class="mt-8 text-center text-fc-sm text-fc-fg-muted">
          Glouton est inclus dans les offres Pro et Studio de Facile. Un abonnement donne accès à toute l'app.
        </p>
      </div>
    </div>
  </main>

  <footer class="border-t border-fc-border">
    <div class="mx-auto max-w-5xl px-4 py-6 text-center text-fc-sm text-fc-fg-muted sm:px-6">
      © {new Date().getFullYear()} Glouton by
      <a
        href="https://facile.studio"
        class="font-semibold underline underline-offset-2 transition-colors hover:text-fc-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring"
      >Facile.</a>
    </div>
  </footer>
</div>
