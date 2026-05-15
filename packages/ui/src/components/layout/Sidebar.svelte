<script lang="ts">
  import 'iconify-icon';
  export let items: { label: string; icon: string; href: string }[] = [];
  export let activeHref = '/';
  export let resolvePath: (path: string) => string = (path) => path;
  export let settingsHref: string | undefined = undefined;
  export let logoSrc: string | undefined = undefined;
  export let logoIcon = 'solar:magnet-wave-bold-duotone';
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->

<aside
  class="sticky top-0 flex h-screen w-60 flex-col border-r border-border bg-background selection:bg-foreground selection:text-background"
>
  <div class="px-5 pt-8 pb-6">
    <div class="flex items-center gap-3">
      {#if logoSrc}
        <img src={logoSrc} alt="Glouton" class="h-7 w-7" />
      {:else}
        <iconify-icon icon={logoIcon} width="28" class="text-foreground"></iconify-icon>
      {/if}
      <h1 class="text-2xl font-bold leading-none text-foreground">
        Glouton
      </h1>
    </div>
  </div>

  <div class="mb-4 px-3">
    <slot name="context-switcher" />
  </div>

  <nav class="flex flex-1 flex-col gap-1 px-3">
    {#each items as item (item.href)}
      <a
        href={resolvePath(item.href)}
        data-sveltekit-reload
        class="group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors
        {activeHref.startsWith(item.href)
          ? 'bg-foreground text-background font-medium'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
      >
        <iconify-icon icon={item.icon} width="18"
        ></iconify-icon>

        <span>
          {item.label}
        </span>
      </a>
    {/each}
  </nav>

  <div class="mt-auto space-y-3 border-t border-border p-4">
    <div
      class="rounded-lg border border-border bg-muted/40 p-2.5"
    >
      <div class="flex items-center gap-3">
        <div
          class="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-foreground text-background"
        >
          <slot name="user-avatar" />
        </div>

        <div class="flex-1 min-w-0">
          <p class="truncate text-sm font-medium text-foreground">
            <slot name="user-name" />
          </p>
          <p class="truncate text-xs text-muted-foreground">
            <slot name="user-email">operator@glouton.app</slot>
          </p>
        </div>
      </div>
    </div>

    {#if settingsHref}
      <a
        href={resolvePath(settingsHref)}
        data-sveltekit-reload
        class="group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors
        {settingsHref && activeHref.startsWith(settingsHref)
          ? 'bg-foreground text-background font-medium'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
      >
        <iconify-icon icon="solar:settings-bold" width="18"></iconify-icon>
        <span>Paramètres</span>
      </a>
    {/if}
  </div>
</aside>

<style>
  :global(body) {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
</style>
