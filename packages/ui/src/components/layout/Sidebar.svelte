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
  <div class="px-4 pt-6 pb-4">
    <div class="flex items-center gap-2">
      {#if logoSrc}
        <img src={logoSrc} alt="Glouton" class="h-[22px] w-[22px]" />
      {:else}
        <iconify-icon icon={logoIcon} width="22" class="text-foreground"></iconify-icon>
      {/if}
      <h1 class="text-base font-semibold leading-none text-foreground">
        Glouton
      </h1>
    </div>
  </div>

  <div class="mb-3 px-3">
    <slot name="context-switcher" />
  </div>

  <nav class="flex flex-1 flex-col gap-1 px-3">
    {#each items as item (item.href)}
      <a
        href={resolvePath(item.href)}
        data-sveltekit-reload
        class="flex h-9 items-center gap-2 rounded-lg px-3 text-sm transition-colors
        {activeHref.startsWith(item.href)
          ? 'bg-muted text-foreground font-medium'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
      >
        <iconify-icon icon={item.icon} width="16"
        ></iconify-icon>

        <span>
          {item.label}
        </span>
      </a>
    {/each}
  </nav>

  <div class="mt-auto space-y-2 border-t border-border p-3">
    <div class="flex items-center gap-2.5 px-1 py-1">
      <div
        class="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-foreground"
      >
        <slot name="user-avatar" />
      </div>

      <div class="flex-1 min-w-0">
        <p class="truncate text-sm font-medium text-foreground leading-tight">
          <slot name="user-name" />
        </p>
        <p class="truncate text-xs text-muted-foreground leading-tight">
          <slot name="user-email">operator@glouton.app</slot>
        </p>
      </div>
    </div>

    {#if settingsHref}
      <a
        href={resolvePath(settingsHref)}
        data-sveltekit-reload
        class="flex h-9 items-center gap-2 rounded-lg px-3 text-sm transition-colors
        {settingsHref && activeHref.startsWith(settingsHref)
          ? 'bg-muted text-foreground font-medium'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
      >
        <iconify-icon icon="solar:settings-linear" width="16"></iconify-icon>
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
