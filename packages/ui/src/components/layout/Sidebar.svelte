<script lang="ts">
  import 'iconify-icon';
  export let items: { label: string; icon: string; href: string }[] = [];
  export let activeHref = '/';
  export let resolvePath: (path: string) => string = (path) => path;
  export let userHref: string | undefined = undefined;
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
        <iconify-icon icon={item.icon} width="16"></iconify-icon>
        <span>{item.label}</span>
      </a>
    {/each}
  </nav>

  <div class="mt-auto flex flex-col gap-2 border-t border-border p-3">
    <svelte:element
      this={userHref ? 'a' : 'div'}
      href={userHref ? resolvePath(userHref) : undefined}
      data-sveltekit-reload={userHref ? '' : undefined}
      class="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/40 p-2 transition-colors {userHref ? 'hover:bg-muted' : ''}"
    >
      <div
        class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-foreground text-xs font-semibold text-background"
      >
        <slot name="user-avatar" />
      </div>

      <div class="flex-1 min-w-0">
        <p class="truncate text-sm font-medium text-foreground leading-tight">
          <slot name="user-name" />
        </p>
        <p class="truncate text-xs text-muted-foreground leading-tight mt-0.5">
          <slot name="user-email">operator@glouton.app</slot>
        </p>
      </div>
    </svelte:element>

    <slot name="logout" />
  </div>
</aside>

<style>
  :global(body) {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
</style>
