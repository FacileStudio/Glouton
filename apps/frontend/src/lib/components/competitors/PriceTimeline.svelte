<script lang="ts">
  import { Badge } from '@facile/muse';
  import type { RouterOutputs } from '@repo/trpc-client';
  import { useFormat, useT } from '$lib/i18n';
  import type { Key } from '$lib/i18n/rows';

  type Extraction = RouterOutputs['competitorAi']['priceTimeline'][number];
  type PriceEvent = Extraction['events'][number];

  let { extractions }: { extractions: Extraction[] } = $props();

  const t = useT();
  const format = useFormat();

  const TONES: Record<PriceEvent['kind'], 'warning' | 'info' | 'danger' | 'success' | 'neutral'> = {
    PRICE_CHANGED: 'warning',
    PLAN_ADDED: 'info',
    PLAN_REMOVED: 'neutral',
    FREE_TIER_APPEARED: 'danger',
    FREE_TIER_REMOVED: 'success',
  };

  function money(amount: number | null, currency: string | null): string {
    if (amount === null) return t('timeline.quote');
    const options = currency ? { style: 'currency' as const, currency, maximumFractionDigits: 2 } : { maximumFractionDigits: 2 };
    return format.number(amount, options);
  }

  function describe(event: PriceEvent): string {
    const percent = event.percent === null ? '' : ` (${event.percent > 0 ? '+' : ''}${format.number(event.percent, { maximumFractionDigits: 1 })} %)`;
    return t(`timeline.event.${event.kind}` as Key, {
      plan: event.plan,
      old: money(event.oldPrice, event.currency),
      new: money(event.newPrice, event.currency),
      percent,
    });
  }
</script>

<ol class="flex flex-col gap-3" aria-label={t('timeline.title')}>
  {#each extractions as extraction, index (extraction.id)}
    <li class="flex flex-col gap-2 rounded-fc-md bg-fc-surface p-3">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-fc-xs text-fc-fg-muted">
        <span class="font-medium text-fc-fg">{format.dateTime(extraction.extractedAt)}</span>
        <Badge>{t(`timeline.trigger.${extraction.trigger === 'watch' ? 'watch' : 'manual'}` as Key)}</Badge>
      </div>
      {#if extraction.events.length > 0}
        <ul class="flex flex-col gap-1.5">
          {#each extraction.events as event (event.id)}
            <li class="flex items-start gap-2 text-fc-sm text-fc-fg">
              <Badge tone={TONES[event.kind]} class="mt-0.5 shrink-0">{t(`timeline.badge.${event.kind}` as Key)}</Badge>
              <span class="min-w-0 wrap-anywhere">{describe(event)}</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="text-fc-sm text-fc-fg-muted">{index === extractions.length - 1 ? t('timeline.first') : t('timeline.same')}</p>
      {/if}
    </li>
  {/each}
</ol>
