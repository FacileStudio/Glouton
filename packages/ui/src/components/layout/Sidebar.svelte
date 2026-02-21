<script lang="ts">
  import 'iconify-icon';
  export let items: { label: string; icon: string; href: string }[] = [];
  export let activeHref = '/';
  export let resolvePath: (path: string) => string = (path) => path;
  export let settingsHref: string | undefined = undefined;
  export let logoSrc: string | undefined = undefined;
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->

<aside
  class="w-72 h-screen sticky top-0 bg-white border-r-2 border-neutral-100 p-8 flex flex-col selection:bg-black selection:text-white"
>
  <div class="mb-8 px-2">
    <div class="flex items-center gap-3">
      {#if logoSrc}
        <img src={logoSrc} alt="Glouton Logo" class="w-10 h-10" />
      {:else}
        <iconify-icon icon="solar:ghost-bold" width="40" class="text-yellow-400"></iconify-icon>
      {/if}
      <h1 class="text-3xl font-black tracking-tight leading-none text-black">
        Glouton.
      </h1>
    </div>
  </div>

  <div class="mb-8">
    <slot name="context-switcher" />
  </div>

  <nav class="flex-1 space-y-2">
    {#each items as item (item.href)}
      <a
        href={resolvePath(item.href)}
        data-sveltekit-reload
        class="group relative flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-200
        {activeHref.startsWith(item.href)
          ? 'bg-neutral-900 text-white shadow-lg shadow-neutral-200'
          : 'text-neutral-600 hover:bg-neutral-50 hover:text-black'}"
      >
        <iconify-icon icon={item.icon} width="24" class="transition-transform group-hover:scale-110"
        ></iconify-icon>

        <span class="font-bold tracking-tight text-[13px]">
          {item.label}
        </span>
      </a>
    {/each}
  </nav>

  <div class="mt-auto pt-6 border-t border-neutral-50 space-y-3">
    <div
      class="p-4 bg-neutral-50 rounded-[24px] border border-neutral-100"
    >
      <div class="flex items-center gap-3">
        <div
          class="w-11 h-11 rounded-xl bg-white border border-neutral-200 overflow-hidden flex-shrink-0 flex items-center justify-center shadow-sm"
        >
          <slot name="user-avatar" />
        </div>

        <div class="flex-1 min-w-0">
          <p class="text-[13px] font-black text-black truncate leading-tight">
            <slot name="user-name" />
          </p>
          <p class="text-[11px] font-medium text-neutral-400 truncate">
            <slot name="user-email">operator@glouton.app</slot>
          </p>
        </div>
      </div>
    </div>

    {#if settingsHref}
      <a
        href={resolvePath(settingsHref)}
        data-sveltekit-reload
        class="group flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200
        {settingsHref && activeHref.startsWith(settingsHref)
          ? 'bg-neutral-900 text-white shadow-lg shadow-neutral-200'
          : 'text-neutral-600 hover:bg-neutral-50 hover:text-black'}"
      >
        <iconify-icon icon="solar:settings-bold" width="20" class="transition-transform group-hover:scale-110"></iconify-icon>
        <span class="font-bold tracking-tight text-[13px]">Paramètres</span>
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
