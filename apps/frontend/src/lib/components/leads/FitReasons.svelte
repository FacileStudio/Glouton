<script lang="ts">
  import { useT } from '$lib/i18n';
  import { reasonText, type FitReason } from './fit';

  let { reasons }: { reasons: FitReason[] } = $props();

  const t = useT();
</script>

<ul class="flex flex-col gap-1.5">
  {#each reasons as reason (reason.factor)}
    <li class="flex items-start justify-between gap-3 text-fc-sm">
      <span class="min-w-0 wrap-anywhere text-fc-fg">{reasonText(t, reason)}</span>
      <span class="shrink-0 text-fc-xs whitespace-nowrap text-fc-fg-muted tabular-nums">{t('fit.points', { points: reason.points, max: reason.max })}</span>
    </li>
  {/each}
</ul>
