<script lang="ts">
  import { Badge, Button } from '@facile/muse';
  import { useT } from '$lib/i18n';
  import type { Key } from '$lib/i18n/rows';
  import { addedItems, type BattlecardFields, type DraftField } from './ai';
  import type { Objection } from './labels';

  interface Props {
    current: BattlecardFields;
    proposal: BattlecardFields;
    pending: DraftField[];
    saving: DraftField | null;
    onAccept: (field: DraftField) => void;
    onDiscard: (field: DraftField) => void;
  }

  let { current, proposal, pending, saving, onAccept, onDiscard }: Props = $props();

  const t = useT();

  const TITLES: Record<DraftField, Key> = {
    overview: 'competitors.section.overview',
    pricing: 'competitors.section.pricing',
    whyWeWin: 'competitors.section.whyWeWin',
    whyWeLose: 'competitors.section.whyWeLose',
    objections: 'competitors.section.objections',
    landmines: 'competitors.section.landmines',
    proofPoints: 'competitors.section.proofPoints',
  };

  function itemText(item: string | Objection): string {
    return typeof item === 'string' ? item : [item.objection, item.response].filter(Boolean).join(' → ');
  }
</script>

<ul class="flex flex-col gap-3">
          {#each pending as field (field)}
            <li class="flex flex-col gap-3 rounded-fc-md bg-fc-surface p-3">
              <p class="text-fc-sm font-semibold text-fc-fg">{t(TITLES[field])}</p>
              {#if field === 'overview' || field === 'pricing'}
                <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div class="flex flex-col gap-1 rounded-fc-md bg-fc-component p-2">
                    <Badge class="w-fit shrink-0">{t('competitorAi.current')}</Badge>
                    <p class="text-fc-sm whitespace-pre-line text-fc-fg-muted">{current[field] || '—'}</p>
                  </div>
                  <div class="flex flex-col gap-1 rounded-fc-md bg-fc-success/10 p-2">
                    <Badge tone="success" class="w-fit shrink-0">{t('competitorAi.proposed')}</Badge>
                    <p class="text-fc-sm whitespace-pre-line text-fc-fg">{proposal[field]}</p>
                  </div>
                </div>
              {:else}
                <div class="flex flex-col gap-1 rounded-fc-md bg-fc-success/10 p-2">
                  <Badge tone="success" class="w-fit shrink-0">{t('competitorAi.added')}</Badge>
                  <ul class="flex list-disc flex-col gap-1 pl-5 text-fc-sm text-fc-fg">
                    {#each addedItems(field, current, proposal) as item, index (index)}<li>{itemText(item)}</li>{/each}
                  </ul>
                </div>
              {/if}
              <div class="flex flex-wrap gap-2">
                <Button size="sm" icon="solar:check-circle-linear" onclick={() => onAccept(field)} disabled={saving !== null}>{t('competitorAi.accept')}</Button>
                <Button size="sm" variant="ghost" onclick={() => onDiscard(field)} disabled={saving !== null}>{t('competitorAi.discard')}</Button>
              </div>
            </li>
          {/each}
        </ul>
