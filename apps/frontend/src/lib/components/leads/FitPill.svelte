<script lang="ts">
  import { Badge, Tooltip } from '@facile/muse';
  import { useT } from '$lib/i18n';
  import { fitTone, reasonsSummary, type FitItem } from './fit';

  let { fit }: { fit: Pick<FitItem, 'score' | 'reasons'> } = $props();

  const t = useT();
</script>

<Tooltip text={reasonsSummary(t, fit.reasons)} describe={false} class="contents">
  <span role="img" aria-label={t('fit.pillLabel', { score: fit.score })} class="inline-flex min-h-6 items-center rounded-fc-pill">
    <Badge tone={fitTone(fit.score)} class="tabular-nums">{fit.score}</Badge>
  </span>
</Tooltip>
