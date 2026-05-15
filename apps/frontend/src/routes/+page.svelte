<script lang="ts">
  import { resolve } from '$app/paths';
  import authStore from '$lib/auth-store';
  import 'iconify-icon';

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

<div class="min-h-screen bg-background text-foreground">
  <header class="border-b border-border">
    <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
      <a href={resolve('/')} class="flex h-14 items-center gap-3">
        <iconify-icon icon="solar:magnet-wave-bold-duotone" width="28"></iconify-icon>
        <span class="text-2xl font-bold">Glouton</span>
      </a>

      <div class="flex items-center gap-2">
        {#if !$authStore.session}
          <a
            href={resolve('/login')}
            class="inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Connexion
          </a>
          <a
            href={resolve('/register')}
            class="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
          >
            Commencer
          </a>
        {:else}
          <a
            href={resolve('/app/leads')}
            class="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
          >
            Ouvrir l'app
          </a>
        {/if}
      </div>
    </div>
  </header>

  <main>
    <section class="mx-auto max-w-5xl px-6 py-24 text-center">
      <h1 class="text-5xl font-bold tracking-tight md:text-6xl">
        Trouver. Qualifier.<br />Prospecter.
      </h1>
      <p class="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
        Glouton transforme les recherches commerciales en pistes propres, priorisées et prêtes à contacter.
      </p>

      <div class="mt-10 flex flex-col justify-center gap-2 sm:flex-row">
        <a
          href={resolve($authStore.session ? '/app/leads' : '/register')}
          class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
        >
          {$authStore.session ? "Ouvrir l'app" : 'Créer un compte'}
          <iconify-icon icon="solar:arrow-right-linear" width="16"></iconify-icon>
        </a>
        <a
          href={resolve('/login')}
          class="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
        >
          Connexion
        </a>
      </div>
    </section>

    <div class="border-t border-border"></div>

    <section class="mx-auto max-w-5xl px-6 py-20">
      <div class="grid gap-6 md:grid-cols-3">
        {#each features as feature}
          <article class="rounded-xl border border-border bg-card p-6 text-card-foreground">
            <div class="mb-5 flex size-10 items-center justify-center rounded-md border border-border">
              <iconify-icon icon={feature.icon} width="22"></iconify-icon>
            </div>
            <h2 class="text-lg font-semibold">{feature.title}</h2>
            <p class="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.desc}</p>
          </article>
        {/each}
      </div>
    </section>

    <div class="border-t border-border"></div>

    <section class="mx-auto grid max-w-5xl gap-6 px-6 py-20 md:grid-cols-[1fr_1.2fr] md:items-center">
      <div>
        <h2 class="text-3xl font-bold">Une seule table de vérité pour les leads.</h2>
        <p class="mt-4 text-muted-foreground">
          Chasses, audits, cartes, qualification, relance: tout converge dans un espace lisible.
        </p>
      </div>
      <div class="rounded-xl border border-border">
        {#each metrics as metric}
          <div class="flex items-center justify-between border-b border-border px-5 py-4 last:border-b-0">
            <span class="font-medium">{metric[0]}</span>
            <span class="text-sm text-muted-foreground">{metric[1]}</span>
          </div>
        {/each}
      </div>
    </section>
  </main>

  <footer class="border-t border-border">
    <div class="mx-auto max-w-5xl px-6 py-6 text-center text-sm text-muted-foreground">
      © {new Date().getFullYear()} Glouton by
      <a href="https://facile.studio" class="font-semibold underline">Facile.</a>
    </div>
  </footer>
</div>
