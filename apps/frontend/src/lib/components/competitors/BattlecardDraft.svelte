<script lang="ts">
  import { Alert, Badge, Button, Card, PlanLimit, Spinner, planLimitFrom, toast, type PlanLimitError } from '@facile/muse';
  import { QUIET } from '@repo/trpc-client';
  import { trpc } from '$lib/trpc';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { useLocale, useT } from '$lib/i18n';
  import type { Key } from '$lib/i18n/rows';
  import { DRAFT_FIELDS, acceptedValue, addedItems, aiLanguage, hasNews, type BattlecardFields, type DraftField } from './ai';
  import { shortUrl } from './watch';
  import type { Objection } from './labels';

  interface Props {
    competitorId: string;
    teamId?: string;
    current: BattlecardFields;
    onSaved: () => Promise<void>;
  }

  let { competitorId, teamId, current, onSaved }: Props = $props();

  const t = useT();
  const locale = useLocale();

  let drafting = $state(false);
  let proposal = $state<BattlecardFields | null>(null);
  let sources = $state<string[]>([]);
  let pending = $state<DraftField[]>([]);
  let saving = $state<DraftField | null>(null);
  let refused = $state<PlanLimitError | null>(null);
  let failure = $state<string | null>(null);

  const TITLES: Record<DraftField, Key> = {
    overview: 'competitors.section.overview',
    pricing: 'competitors.section.pricing',
    whyWeWin: 'competitors.section.whyWeWin',
    whyWeLose: 'competitors.section.whyWeLose',
    objections: 'competitors.section.objections',
    landmines: 'competitors.section.landmines',
    proofPoints: 'competitors.section.proofPoints',
  };

  function messageFor(error: unknown): string {
    const code = (error as { data?: { code?: string } } | null)?.data?.code;
    if (code === 'UNPROCESSABLE_CONTENT') return t('competitorAi.badOutput');
    if (code === 'TOO_MANY_REQUESTS') return t('competitorAi.quota');
    if (code === 'BAD_REQUEST') return t('competitorAi.needWebsite');
    return getTrpcErrorMessage(error) || t('competitorAi.failed');
  }

  async function draft() {
    drafting = true;
    refused = null;
    failure = null;
    try {
      const result = await trpc.competitorAi.draft.mutate({ competitorId, teamId, language: aiLanguage(locale()) }, { context: QUIET });
      proposal = result.proposal;
      sources = result.sources;
      pending = DRAFT_FIELDS.filter((field) => hasNews(field, current, result.proposal));
    } catch (error) {
      const limit = planLimitFrom((error as { data?: { plan_limit?: unknown } } | null)?.data?.plan_limit);
      if (limit) refused = limit;
      else failure = messageFor(error);
    } finally {
      drafting = false;
    }
  }

  async function accept(field: DraftField) {
    if (!proposal) return;
    saving = field;
    try {
      await trpc.competitor.update.mutate({ competitorId, teamId, ...acceptedValue(field, current, proposal) });
      pending = pending.filter((entry) => entry !== field);
      toast.success(t('competitorAi.accepted'));
      await onSaved();
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      saving = null;
    }
  }

  function discard(field: DraftField) {
    pending = pending.filter((entry) => entry !== field);
  }

  function close() {
    proposal = null;
    pending = [];
  }

  function itemText(item: string | Objection): string {
    return typeof item === 'string' ? item : [item.objection, item.response].filter(Boolean).join(' → ');
  }
</script>

<div class="flex flex-col gap-3">
  <div>
    <Button variant="secondary" icon={drafting ? undefined : 'solar:magic-stick-3-linear'} onclick={draft} disabled={drafting}>
      {#if drafting}
        <Spinner size="sm" label={t('competitorAi.drafting')} />
        {t('competitorAi.drafting')}
      {:else}
        {t('competitorAi.draft')}
      {/if}
    </Button>
  </div>
  <PlanLimit error={refused} />
  {#if failure}<Alert tone="danger">{failure}</Alert>{/if}

  {#if proposal}
    <Card class="flex flex-col gap-4" aria-live="polite">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="flex min-w-0 flex-col gap-1">
          <h3 class="flex items-center gap-2 text-fc-md font-semibold text-fc-fg">
            <iconify-icon icon="solar:magic-stick-3-linear" width="18" height="18" class="block shrink-0"></iconify-icon>
            {t('competitorAi.draftTitle')}
          </h3>
          <p class="max-w-prose text-fc-sm text-fc-fg-muted">{t('competitorAi.draftText')}</p>
        </div>
        <Button variant="ghost" size="sm" icon="solar:close-circle-linear" onclick={close}>{t('competitorAi.close')}</Button>
      </div>

      {#if pending.length === 0}
        <p class="text-fc-sm text-fc-fg-muted">{t('competitorAi.nothingNew')}</p>
      {:else}
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
                <Button size="sm" icon="solar:check-circle-linear" onclick={() => accept(field)} disabled={saving !== null}>{t('competitorAi.accept')}</Button>
                <Button size="sm" variant="ghost" onclick={() => discard(field)} disabled={saving !== null}>{t('competitorAi.discard')}</Button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}

      {#if sources.length > 0}
        <div class="flex flex-wrap items-center gap-1.5 text-fc-xs text-fc-fg-muted">
          <span>{t('competitorAi.sources')} :</span>
          {#each sources as url (url)}
            <Button variant="ghost" size="sm" iconRight="solar:arrow-right-up-linear" href={url} target="_blank" rel="noopener noreferrer">{shortUrl(url)}</Button>
          {/each}
        </div>
      {/if}
    </Card>
  {/if}
</div>
