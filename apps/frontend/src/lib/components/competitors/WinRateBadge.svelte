<script lang="ts">
  import { Badge } from '@facile/muse';
  import { useT } from '$lib/i18n';
  import { ratePercent, rateTone, type WinRate } from './labels';

  let { rate }: { rate: WinRate } = $props();
  const t = useT();
  const percent = $derived(ratePercent(rate));
</script>

{#if percent}
  <Badge tone={rateTone(rate)} class="shrink-0" title={t('competitors.record', { won: rate.won, lost: rate.lost })}>
    {t('competitors.winRate')} {percent} · {rate.won}/{rate.total}
  </Badge>
{:else}
  <Badge class="shrink-0">{t('competitors.noDeals')}</Badge>
{/if}
