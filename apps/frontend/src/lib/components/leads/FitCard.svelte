<script lang="ts">
  import { onMount } from 'svelte';
  import { BulleButton, BullePanel, Button, Card, Spinner } from '@facile/muse';
  import { QUIET } from '@repo/trpc-client';
  import { trpc } from '$lib/trpc';
  import { useLocale, useT } from '$lib/i18n';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { aiLanguage } from '$lib/components/competitors/ai';
  import { BulleGate } from '$lib/components/bulle/gate.svelte';
  import FitPill from './FitPill.svelte';
  import FitReasons from './FitReasons.svelte';
  import type { FitItem } from './fit';

  interface Props {
    leadId: string;
    teamId?: string;
    onWrite?: (explanation: { explanation: string; nextStep: string }) => void;
  }

  let { leadId, teamId, onWrite }: Props = $props();

  const t = useT();
  const locale = useLocale();
  const gate = new BulleGate();

  let fit = $state<FitItem | null>(null);
  let busy = $state(false);
  let open = $state(false);
  let error = $state<string | null>(null);
  let answer = $state<{ explanation: string; nextStep: string } | null>(null);

  onMount(async () => {
    void gate.load(teamId);
    try {
      const ranked = await trpc.leadScore.list.query({ teamId, limit: 100 });
      fit = ranked.items.find((item) => item.leadId === leadId) ?? null;
    } catch {
      fit = null;
    }
  });

  function message(e: unknown): string {
    const data = (e as { data?: { code?: string } } | null)?.data;
    if (data?.code === 'UNPROCESSABLE_CONTENT') return t('fit.explain.unreadable');
    return getTrpcErrorMessage(e) || t('fit.explain.failed');
  }

  async function explain() {
    open = true;
    if (busy || gate.upgradeHref !== undefined) return;
    busy = true;
    error = null;
    try {
      answer = await trpc.leadScore.explain.mutate({ leadId, teamId, language: aiLanguage(locale()) }, { context: QUIET });
    } catch (e) {
      if (!gate.refuse((e as { data?: { plan_limit?: { upgrade_url?: string } } } | null)?.data?.plan_limit)) error = message(e);
    } finally {
      busy = false;
    }
  }
</script>

<Card class="flex flex-col gap-3">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h3 class="flex items-center gap-2 text-fc-md font-semibold text-fc-fg">
      <iconify-icon icon="solar:star-shine-linear" width="18" height="18" class="block shrink-0"></iconify-icon>
      {t('fit.why')}
    </h3>
    {#if fit}<FitPill {fit} />{/if}
  </div>
  {#if fit}
    <FitReasons reasons={fit.reasons} />
  {:else}
    <div class="flex justify-center py-2"><Spinner size="sm" /></div>
  {/if}
  <div>
    <BulleButton variant="header" name={gate.name} mood={busy ? 'thinking' : answer ? 'done' : 'idle'} label={t('fit.explain.action')} aria-expanded={open} onclick={explain} />
  </div>
  {#if open}
    <BullePanel
      name={gate.name}
      title={t('fit.explain.title', { name: gate.name })}
      {busy}
      {error}
      onRetry={explain}
      upgradeHref={gate.upgradeHref}
      class="bg-fc-surface"
    >
      {#if answer}
        <div class="flex flex-col gap-3" aria-live="polite">
          <p class="text-fc-sm whitespace-pre-line text-fc-fg">{answer.explanation}</p>
          <div class="flex flex-col gap-1">
            <p class="text-fc-xs font-medium text-fc-fg-muted">{t('fit.explain.next')}</p>
            <p class="text-fc-sm whitespace-pre-line text-fc-fg">{answer.nextStep}</p>
          </div>
          {#if onWrite}
            <Button size="sm" class="self-start" icon="solar:letter-linear" onclick={() => answer && onWrite(answer)}>{t('fit.explain.write')}</Button>
          {/if}
        </div>
      {/if}
    </BullePanel>
  {/if}
</Card>
