<script lang="ts">
  import { onMount } from 'svelte';
  import { BulleButton, BullePanel, Button, Card, toast } from '@facile/muse';
  import { QUIET } from '@repo/trpc-client';
  import type { RouterOutputs } from '@repo/trpc-client';
  import { trpc } from '$lib/trpc';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { useLocale, useT } from '$lib/i18n';
  import { BulleGate } from '$lib/components/bulle/gate.svelte';
  import { DRAFT_FIELDS, acceptedValue, aiLanguage, hasNews, type BattlecardFields, type DraftField } from './ai';
  import ProposalFields from './ProposalFields.svelte';

  type Advice = RouterOutputs['competitorAi']['recommend'];

  interface Props {
    competitorId: string;
    teamId?: string;
    current: BattlecardFields;
    onSaved: () => Promise<void>;
  }

  let { competitorId, teamId, current, onSaved }: Props = $props();

  const t = useT();
  const locale = useLocale();
  const gate = new BulleGate();

  let open = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let advice = $state<Advice | null>(null);
  let proposal = $state<BattlecardFields | null>(null);
  let pending = $state<DraftField[]>([]);
  let saving = $state<DraftField | null>(null);

  onMount(() => void gate.load(teamId));

  function message(e: unknown): string {
    const code = (e as { data?: { code?: string } } | null)?.data?.code;
    if (code === 'UNPROCESSABLE_CONTENT') return t('competitorAi.badOutput');
    if (code === 'BAD_REQUEST') return t('strategy.needPrices');
    if (code === 'TOO_MANY_REQUESTS') return t('competitorAi.quota');
    return getTrpcErrorMessage(e) || t('strategy.failed');
  }

  async function ask() {
    open = true;
    if (busy || gate.upgradeHref !== undefined) return;
    busy = true;
    error = null;
    try {
      const result = await trpc.competitorAi.recommend.mutate({ competitorId, teamId, language: aiLanguage(locale()) }, { context: QUIET });
      const merged: BattlecardFields = { ...current, ...result.battlecardPatch } as BattlecardFields;
      advice = result;
      proposal = merged;
      pending = DRAFT_FIELDS.filter((field) => hasNews(field, current, merged));
    } catch (e) {
      if (!gate.refuse((e as { data?: { plan_limit?: { upgrade_url?: string } } } | null)?.data?.plan_limit)) error = message(e);
    } finally {
      busy = false;
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
    } catch (e) {
      toast.danger(getTrpcErrorMessage(e));
    } finally {
      saving = null;
    }
  }

  function dismiss() {
    open = false;
    advice = null;
    proposal = null;
    pending = [];
    error = null;
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('strategy.copied'));
    } catch {
      toast.danger(t('strategy.copyFailed'));
    }
  }
</script>

<Card class="flex flex-col gap-3">
  <div class="flex flex-col gap-1">
    <h3 class="flex items-center gap-2 text-fc-md font-semibold text-fc-fg">
      <iconify-icon icon="solar:chart-2-linear" width="18" height="18" class="block shrink-0"></iconify-icon>
      {t('strategy.title')}
    </h3>
    <p class="max-w-prose text-fc-sm text-fc-fg-muted">{t('strategy.text')}</p>
  </div>
  <div>
    <BulleButton variant="header" name={gate.name} mood={busy ? 'thinking' : advice ? 'done' : 'idle'} label={t('strategy.ask')} aria-expanded={open} onclick={ask} />
  </div>

  {#if open}
    <BullePanel name={gate.name} title={t('strategy.title')} {busy} {error} onRetry={ask} upgradeHref={gate.upgradeHref} class="bg-fc-surface">
      {#snippet actions()}
        <Button size="sm" variant="ghost" onclick={dismiss}>{t('strategy.dismiss')}</Button>
      {/snippet}
      {#if advice}
        <div class="flex flex-col gap-4" aria-live="polite">
          <section class="flex flex-col gap-1">
            <h4 class="text-fc-sm font-semibold text-fc-fg">{t('strategy.whatChanged')}</h4>
            <p class="text-fc-sm whitespace-pre-line text-fc-fg">{advice.whatChanged}</p>
          </section>
          <section class="flex flex-col gap-1">
            <h4 class="text-fc-sm font-semibold text-fc-fg">{t('strategy.meaning')}</h4>
            <p class="text-fc-sm whitespace-pre-line text-fc-fg">{advice.meaning}</p>
          </section>
          <section class="flex flex-col gap-2">
            <h4 class="text-fc-sm font-semibold text-fc-fg">{t('strategy.options')}</h4>
            <ol class="flex flex-col gap-2">
              {#each advice.options as option, index (index)}
                <li class="flex flex-col gap-1 rounded-fc-md bg-fc-component p-3">
                  <p class="text-fc-sm font-medium wrap-anywhere text-fc-fg">{option.title}</p>
                  <p class="text-fc-sm wrap-anywhere text-fc-fg">{option.action}</p>
                  <p class="text-fc-xs wrap-anywhere text-fc-fg-muted"><span class="font-medium">{t('strategy.tradeOff')}:</span> {option.tradeOff}</p>
                </li>
              {/each}
            </ol>
          </section>
          <section class="flex flex-col gap-2">
            <h4 class="text-fc-sm font-semibold text-fc-fg">{t('strategy.talking')}</h4>
            <ul class="flex flex-col gap-2">
              {#each advice.talkingPoints as point, index (index)}
                <li class="flex items-start justify-between gap-2 rounded-fc-md bg-fc-component p-3">
                  <span class="min-w-0 text-fc-sm wrap-anywhere text-fc-fg">{point}</span>
                  <Button size="sm" variant="ghost" icon="solar:copy-linear" onclick={() => copy(point)}>{t('strategy.copy')}</Button>
                </li>
              {/each}
            </ul>
          </section>
          <section class="flex flex-col gap-2">
            <h4 class="text-fc-sm font-semibold text-fc-fg">{t('strategy.patch')}</h4>
            {#if pending.length === 0 || !proposal}
              <p class="text-fc-sm text-fc-fg-muted">{t('strategy.noPatch')}</p>
            {:else}
              <p class="text-fc-xs text-fc-fg-muted">{t('strategy.patchText')}</p>
              <ProposalFields {current} {proposal} {pending} {saving} onAccept={accept} onDiscard={(field) => (pending = pending.filter((entry) => entry !== field))} />
            {/if}
          </section>
        </div>
      {/if}
    </BullePanel>
  {/if}
</Card>
