<script lang="ts">
  import { resolve } from '$app/paths';
  const lastUpdated = '5 février 2026';
</script>

<div class="min-h-screen bg-background text-foreground">
  <nav class="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
    <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
      <a href={resolve('/')} class="flex items-center gap-3">
        <iconify-icon icon="solar:magnet-wave-bold-duotone" width="24"></iconify-icon>
        <span class="text-lg font-bold">Glouton</span>
      </a>
      <a
        href={resolve('/')}
        class="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <iconify-icon icon="solar:arrow-left-linear" width="16"></iconify-icon>
        Retour
      </a>
    </div>
  </nav>

  <main class="mx-auto max-w-3xl px-6 py-20">
    <p class="text-sm text-muted-foreground">Document légal</p>
    <h1 class="mt-2 text-5xl font-bold tracking-tight md:text-6xl">Confidentialité</h1>
    <p class="mt-3 text-sm text-muted-foreground">Dernière mise à jour : {lastUpdated}</p>

    <div class="mt-12 space-y-10 leading-relaxed">
      <section>
        <h2 class="text-3xl font-bold">1. Informations collectées</h2>
        <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
          Nous collectons les informations que vous nous fournissez directement lors de la création d'un
          compte : nom, adresse e-mail, mot de passe. Nous collectons aussi des données automatiquement via
          des cookies pour améliorer votre expérience.
        </p>
      </section>

      <section>
        <h2 class="text-3xl font-bold">2. Utilisation des données</h2>
        <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
          Vos données servent à fournir, maintenir et améliorer nos services. Nous ne vendons pas vos
          données personnelles à des tiers. Nous utilisons tRPC et PostgreSQL pour traiter vos données de
          manière sécurisée et efficace.
        </p>
      </section>

      <section>
        <h2 class="text-3xl font-bold">3. Sécurité</h2>
        <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
          Nous appliquons les standards de sécurité de l'industrie pour protéger vos informations. Aucune
          méthode de transmission sur Internet n'est cependant garantie à 100%.
        </p>
      </section>
    </div>
  </main>
</div>
