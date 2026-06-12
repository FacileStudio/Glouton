<script lang="ts">
  import 'iconify-icon';

  let {
    items = [],
    activeHref = '/',
    settingsHref = '/app/settings',
    userAvatarUrl = null,
    userInitials = 'U',
    userName = 'Utilisateur',
  }: {
    items?: { label: string; icon: string; href: string }[];
    activeHref?: string;
    settingsHref?: string;
    userAvatarUrl?: string | null;
    userInitials?: string;
    userName?: string;
  } = $props();

  let avatarFailed = $state(false);

  // Reset the fallback when the avatar URL changes (e.g. after profile update).
  $effect(() => {
    void userAvatarUrl;
    avatarFailed = false;
  });

  let settingsActive = $derived(activeHref.startsWith(settingsHref));
</script>

<nav
  class="fixed inset-x-0 z-50 flex justify-center px-4 md:hidden"
  style="bottom: max(0.75rem, env(safe-area-inset-bottom))"
>
  <div
    class="flex items-center gap-1 rounded-full border border-border/40 bg-background/55 p-1.5 shadow-lg shadow-black/10 ring-1 ring-white/10 backdrop-blur-2xl backdrop-saturate-150"
  >
    {#each items as item (item.href)}
      <a
        href={item.href}
        data-sveltekit-reload
        aria-label={item.label}
        title={item.label}
        class="flex items-center justify-center rounded-full px-3.5 py-2 transition-all duration-200 {activeHref.startsWith(
          item.href
        )
          ? 'bg-foreground text-background shadow-sm'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}"
      >
        <iconify-icon icon={item.icon} width="22"></iconify-icon>
      </a>
    {/each}

    <a
      href={settingsHref}
      data-sveltekit-reload
      aria-label="Paramètres"
      title="Paramètres"
      class="flex items-center justify-center rounded-full px-2.5 py-1.5 transition-all duration-200 {settingsActive
        ? 'bg-foreground shadow-sm'
        : 'hover:bg-muted/60'}"
    >
      {#if userAvatarUrl && !avatarFailed}
        <img
          src={userAvatarUrl}
          alt={userName}
          class="h-7 w-7 rounded-full border border-border object-cover"
          onerror={() => (avatarFailed = true)}
        />
      {:else}
        <span
          class="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-foreground text-[10px] font-semibold text-background"
        >
          {userInitials}
        </span>
      {/if}
    </a>
  </div>
</nav>
