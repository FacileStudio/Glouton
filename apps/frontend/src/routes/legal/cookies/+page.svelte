<script lang="ts">
  import { resolve } from '$app/paths';
  import { Button } from '@facile/muse';
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
    <h1 class="mt-2 font-fc-title text-fc-3xl font-semibold tracking-tight">Cookies</h1>
    <p class="mt-3 text-fc-sm text-fc-fg-muted">Dernière mise à jour : 5 février 2026</p>

    <div class="mt-12 space-y-10 leading-relaxed">
      <section>
        <h2 class="font-fc-title text-fc-xl font-semibold tracking-tight">Qu'est-ce qu'un cookie ?</h2>
        <p class="mt-3 text-fc-sm leading-relaxed text-fc-fg-muted">
          Les cookies sont de petits fichiers texte utilisés pour stocker des informations sur votre appareil
          lorsque vous consultez un site web depuis votre navigateur.
        </p>
      </section>

      <section>
        <h2 class="font-fc-title text-fc-xl font-semibold tracking-tight">Comment nous les utilisons</h2>
        <p class="mt-3 text-fc-sm leading-relaxed text-fc-fg-muted">
          Nous utilisons des cookies internes et tiers à plusieurs fins. Les cookies internes sont
          essentiellement nécessaires au bon fonctionnement du site, comme le maintien de votre session
          d'authentification.
        </p>
      </section>

      <section>
        <div class="divide-y divide-fc-border rounded-fc-lg bg-fc-component">
          <div class="grid grid-cols-2 gap-4 px-5 py-3 text-fc-sm font-medium">
            <span>Cookie</span>
            <span>Usage</span>
          </div>
          <div class="grid grid-cols-2 gap-4 px-5 py-4 text-fc-sm">
            <span class="font-medium">auth_session</span>
            <span class="text-fc-fg-muted">Maintien de session (essentiel)</span>
          </div>
          <div class="grid grid-cols-2 gap-4 px-5 py-4 text-fc-sm">
            <span class="font-medium">_ga</span>
            <span class="text-fc-fg-muted">Analytique (optionnel)</span>
          </div>
        </div>
      </section>
    </div>
  </main>
</div>
