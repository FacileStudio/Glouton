<script lang="ts">
  import { Badge, Card } from '@facile/muse';
  import { useT } from '$lib/i18n';
  import type { Objection } from './labels';

  interface Props {
    overview: string | null;
    whyWeWin: string[];
    whyWeLose: string[];
    objections: Objection[];
    landmines: string[];
    pricing: string | null;
    proofPoints: string[];
    compact?: boolean;
  }

  let { overview, whyWeWin, whyWeLose, objections, landmines, pricing, proofPoints, compact = false }: Props = $props();
  const t = useT();
  const cardClass = $derived(compact ? 'flex flex-col gap-2 p-4' : 'flex flex-col gap-3');
</script>

{#snippet empty()}
  <p class="text-fc-sm text-fc-fg-muted">{t('competitors.empty')}</p>
{/snippet}

{#snippet lines(title: string, icon: string, items: string[])}
  <Card class={cardClass}>
    <h3 class="flex items-center gap-2 text-fc-md font-semibold text-fc-fg">
      <iconify-icon {icon} width="18" height="18" class="block shrink-0"></iconify-icon>
      {title}
    </h3>
    {#if items.length === 0}
      {@render empty()}
    {:else}
      <ul class="flex list-disc flex-col gap-1.5 pl-5 text-fc-sm text-fc-fg">
        {#each items as item, index (index)}<li>{item}</li>{/each}
      </ul>
    {/if}
  </Card>
{/snippet}

{#snippet text(title: string, icon: string, value: string | null)}
  <Card class={cardClass}>
    <h3 class="flex items-center gap-2 text-fc-md font-semibold text-fc-fg">
      <iconify-icon {icon} width="18" height="18" class="block shrink-0"></iconify-icon>
      {title}
    </h3>
    {#if value}
      <p class="text-fc-sm whitespace-pre-line text-fc-fg">{value}</p>
    {:else}
      {@render empty()}
    {/if}
  </Card>
{/snippet}

<div class={compact ? 'flex flex-col gap-3' : 'grid grid-cols-1 gap-4 lg:grid-cols-2'}>
  {@render text(t('competitors.section.overview'), 'solar:document-text-linear', overview)}
  {@render text(t('competitors.section.pricing'), 'solar:tag-price-linear', pricing)}
  {@render lines(t('competitors.section.whyWeWin'), 'solar:cup-star-linear', whyWeWin)}
  {@render lines(t('competitors.section.whyWeLose'), 'solar:danger-triangle-linear', whyWeLose)}
  <Card class="{cardClass} {compact ? '' : 'lg:col-span-2'}">
    <h3 class="flex items-center gap-2 text-fc-md font-semibold text-fc-fg">
      <iconify-icon icon="solar:chat-round-line-linear" width="18" height="18" class="block shrink-0"></iconify-icon>
      {t('competitors.section.objections')}
    </h3>
    {#if objections.length === 0}
      {@render empty()}
    {:else}
      <ul class="flex flex-col gap-3">
        {#each objections as item, index (index)}
          <li class="flex flex-col gap-1.5 rounded-fc-md bg-fc-surface p-3">
            <p class="text-fc-sm font-semibold text-fc-fg">{item.objection}</p>
            {#if item.response}<p class="text-fc-sm text-fc-fg">{item.response}</p>{/if}
            {#if item.proof}
              <div class="flex min-w-0 items-center gap-2">
                <Badge tone="info" class="shrink-0">{t('competitors.proof')}</Badge>
                <span class="min-w-0 text-fc-xs text-fc-fg-muted">{item.proof}</span>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </Card>
  {@render lines(t('competitors.section.landmines'), 'solar:question-circle-linear', landmines)}
  {@render lines(t('competitors.section.proofPoints'), 'solar:verified-check-linear', proofPoints)}
</div>
