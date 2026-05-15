<script lang="ts">
  import { resolve } from '$app/paths';
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
    <h1 class="mt-2 text-5xl font-bold tracking-tight md:text-6xl">Cookies</h1>
    <p class="mt-3 text-sm text-muted-foreground">Dernière mise à jour : 5 février 2026</p>

    <div class="mt-12 space-y-10 leading-relaxed">
      <section>
        <h2 class="text-3xl font-bold">Qu'est-ce qu'un cookie ?</h2>
        <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
          Les cookies sont de petits fichiers texte utilisés pour stocker des informations sur votre appareil
          lorsque vous consultez un site web depuis votre navigateur.
        </p>
      </section>

      <section>
        <h2 class="text-3xl font-bold">Comment nous les utilisons</h2>
        <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
          Nous utilisons des cookies internes et tiers à plusieurs fins. Les cookies internes sont
          essentiellement nécessaires au bon fonctionnement du site, comme le maintien de votre session
          d'authentification.
        </p>
      </section>

      <section>
        <div class="rounded-xl border border-border bg-card">
          <div class="grid grid-cols-2 border-b border-border px-5 py-3 text-sm font-medium">
            <span>Cookie</span>
            <span>Usage</span>
          </div>
          <div class="grid grid-cols-2 border-b border-border px-5 py-4 text-sm">
            <span class="font-medium">auth_session</span>
            <span class="text-muted-foreground">Maintien de session (essentiel)</span>
          </div>
          <div class="grid grid-cols-2 px-5 py-4 text-sm">
            <span class="font-medium">_ga</span>
            <span class="text-muted-foreground">Analytique (optionnel)</span>
          </div>
        </div>
      </section>
    </div>
  </main>
</div>
