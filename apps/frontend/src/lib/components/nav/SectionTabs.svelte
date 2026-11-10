<script lang="ts">
  import { page } from '$app/state';
  import { Tabs } from '@facile/muse';
  import { useT } from '$lib/i18n';
  import { profileStore } from '$lib/stores/profile.svelte';
  import { navFor, type NavSection } from '$lib/usage/nav';

  let { section, badges = {} }: { section: NavSection['id']; badges?: Record<string, string | undefined> } = $props();

  const t = useT();

  const current = $derived(navFor(profileStore.usages()).find((entry) => entry.id === section));
  const items = $derived(
    (current?.tabs ?? []).map((tab) => ({ id: tab.id, label: t(tab.label), icon: tab.icon, href: tab.href, badge: badges[tab.id] })),
  );
  const active = $derived(
    [...(current?.tabs ?? [])]
      .sort((a, b) => b.href.length - a.href.length)
      .find((tab) => page.url.pathname === tab.href || page.url.pathname.startsWith(`${tab.href}/`))?.id ?? '',
  );
</script>

{#if items.length > 1}
  <Tabs {items} value={active} label={current ? t(current.label) : undefined} />
{/if}
