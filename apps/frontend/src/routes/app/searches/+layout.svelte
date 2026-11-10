<script lang="ts">
  import SectionTabs from '$lib/components/nav/SectionTabs.svelte';

  let { children } = $props();
</script>

<div class="flex flex-col gap-6">
  <SectionTabs section="searches" />
  {@render children()}
</div>
