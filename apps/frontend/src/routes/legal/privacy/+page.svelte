<script lang="ts">
  import { resolve } from '$app/paths';
  import { Button } from '@facile/muse';
  const lastUpdated = '5 février 2026';
</script>

<div class="min-h-dvh bg-fc-page text-fc-fg">
  <nav class="sticky top-0 z-50 border-b border-fc-border bg-fc-page/80 backdrop-blur">
    <div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
      <a
        href={resolve('/')}
        class="flex items-center gap-3 rounded-fc-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring"
      >
        <iconify-icon icon="solar:magnet-wave-bold-duotone" width="24" height="24" class="block shrink-0"></iconify-icon>
        <span class="font-fc-title text-fc-lg font-semibold tracking-tight">Glouton</span>
      </a>
      <Button variant="ghost" href={resolve('/')} icon="solar:arrow-left-linear" class="rounded-fc-md">
        Retour
      </Button>
    </div>
  </nav>

  <main class="mx-auto max-w-3xl px-4 py-20 sm:px-6">
    <p class="text-fc-sm text-fc-fg-muted">Document légal</p>
    <h1 class="mt-2 font-fc-title text-fc-3xl font-semibold tracking-tight">Confidentialité</h1>
    <p class="mt-3 text-fc-sm text-fc-fg-muted">Dernière mise à jour : {lastUpdated}</p>

    <div class="mt-12 space-y-10 leading-relaxed">
      <section>
        <h2 class="font-fc-title text-fc-xl font-semibold tracking-tight">1. Informations collectées</h2>
        <p class="mt-3 text-fc-sm leading-relaxed text-fc-fg-muted">
          Nous collectons les informations que vous nous fournissez directement lors de la création d'un
          compte : nom, adresse e-mail, mot de passe. Nous collectons aussi des données automatiquement via
          des cookies pour améliorer votre expérience.
        </p>
      </section>

      <section>
        <h2 class="font-fc-title text-fc-xl font-semibold tracking-tight">2. Utilisation des données</h2>
        <p class="mt-3 text-fc-sm leading-relaxed text-fc-fg-muted">
          Vos données servent à fournir, maintenir et améliorer nos services. Nous ne vendons pas vos
          données personnelles à des tiers. Nous utilisons tRPC et PostgreSQL pour traiter vos données de
          manière sécurisée et efficace.
        </p>
      </section>

      <section>
        <h2 class="font-fc-title text-fc-xl font-semibold tracking-tight">3. Sécurité</h2>
        <p class="mt-3 text-fc-sm leading-relaxed text-fc-fg-muted">
          Nous appliquons les standards de sécurité de l'industrie pour protéger vos informations. Aucune
          méthode de transmission sur Internet n'est cependant garantie à 100%.
        </p>
      </section>
    </div>
  </main>
</div>
