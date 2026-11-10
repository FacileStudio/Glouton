<script lang="ts">
  import SectionTabs from '$lib/components/nav/SectionTabs.svelte';
  import { inboxCount } from '$lib/stores/inbox-count.svelte';

  let { children } = $props();

  const badges = $derived({ inbox: inboxCount.value > 0 ? String(inboxCount.value) : undefined });
</script>

<div class="flex flex-col gap-6">
  <SectionTabs section="messages" {badges} />
  {@render children()}
</div>
