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
    <h1 class="mt-2 font-fc-title text-fc-3xl font-semibold tracking-tight">Conditions</h1>
    <p class="mt-3 text-fc-sm text-fc-fg-muted">Date d'effet : 5 février 2026</p>

    <div class="mt-12 space-y-10 leading-relaxed">
      <section>
        <h2 class="font-fc-title text-fc-xl font-semibold tracking-tight">1. Acceptation des conditions</h2>
        <p class="mt-3 text-fc-sm leading-relaxed text-fc-fg-muted">
          En accédant à Glouton, vous acceptez d'être lié par ces conditions de service ainsi que par
          l'ensemble des lois et règlements applicables.
        </p>
      </section>

      <section>
        <h2 class="font-fc-title text-fc-xl font-semibold tracking-tight">2. Licence d'utilisation</h2>
        <p class="mt-3 text-fc-sm leading-relaxed text-fc-fg-muted">
          Une autorisation est accordée pour télécharger temporairement une copie des contenus à des fins
          personnelles et non commerciales. Il s'agit d'une licence, non d'un transfert de propriété.
        </p>
      </section>

      <section>
        <h2 class="font-fc-title text-fc-xl font-semibold tracking-tight">3. Avertissement</h2>
        <p class="mt-3 text-fc-sm leading-relaxed text-fc-fg-muted">
          Les contenus de Glouton sont fournis « en l'état ». Nous ne donnons aucune garantie, expresse ou
          implicite, et déclinons toutes les autres garanties incluant, sans limitation, les garanties
          implicites de qualité marchande.
        </p>
      </section>
    </div>
  </main>
</div>
