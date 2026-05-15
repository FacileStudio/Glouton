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
    <h1 class="mt-2 text-5xl font-bold tracking-tight md:text-6xl">Conditions</h1>
    <p class="mt-3 text-sm text-muted-foreground">Date d'effet : 5 février 2026</p>

    <div class="mt-12 space-y-10 leading-relaxed">
      <section>
        <h2 class="text-3xl font-bold">1. Acceptation des conditions</h2>
        <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
          En accédant à Glouton, vous acceptez d'être lié par ces conditions de service ainsi que par
          l'ensemble des lois et règlements applicables.
        </p>
      </section>

      <section>
        <h2 class="text-3xl font-bold">2. Licence d'utilisation</h2>
        <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
          Une autorisation est accordée pour télécharger temporairement une copie des contenus à des fins
          personnelles et non commerciales. Il s'agit d'une licence, non d'un transfert de propriété.
        </p>
      </section>

      <section>
        <h2 class="text-3xl font-bold">3. Avertissement</h2>
        <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
          Les contenus de Glouton sont fournis « en l'état ». Nous ne donnons aucune garantie, expresse ou
          implicite, et déclinons toutes les autres garanties incluant, sans limitation, les garanties
          implicites de qualité marchande.
        </p>
      </section>
    </div>
  </main>
</div>
