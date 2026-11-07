<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Alert, Button, Input, PlanLimit, Spinner, planLimitFrom, type PlanLimitError } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import BulleBlob from './BulleBlob.svelte';
  import {
    BULLE_SETTINGS_URL,
    REASONS,
    assistantStatus,
    type ApplyMode,
    type AssistantStatus,
    type BulleMood,
    type NextAction,
    type WriteAction,
    type WriteResult,
  } from './status';
  import { useT } from '$lib/i18n';

  const t = useT();

  interface Props {
    task?: 'write' | 'next';
    context: { teamId?: string; personId?: string; companyId?: string };
    subject?: string;
    body?: string;
    inputId?: string;
    onApply?: (result: WriteResult, mode: ApplyMode) => void;
    onUseDraft?: (draft: NonNullable<NextAction['draft']>) => void;
    class?: string;
  }

  let {
    task = 'write',
    context,
    subject = '',
    body = '',
    inputId = 'bulle-instruction',
    onApply,
    onUseDraft,
    class: className = '',
  }: Props = $props();

  const QUICK = $derived<Array<{ action: WriteAction; label: string; needsBody?: boolean; language?: 'en' }>>([
    { action: 'draft', label: t('assistant.draft') },
    { action: 'reply', label: t('assistant.reply') },
    { action: 'shorter', label: t('assistant.shorter'), needsBody: true },
    { action: 'warmer', label: t('assistant.warmer'), needsBody: true },
    { action: 'formal', label: t('assistant.formal'), needsBody: true },
    { action: 'fix', label: t('assistant.fix'), needsBody: true },
    { action: 'translate', label: t('assistant.translate'), needsBody: true, language: 'en' },
    { action: 'subject', label: t('assistant.subject'), needsBody: true },
  ]);

  let status = $state<AssistantStatus | null>(null);
  let statusError = $state(false);
  let busy = $state(false);
  let cheered = $state(false);
  let instruction = $state('');
  let error = $state<string | null>(null);
  let refused = $state<PlanLimitError | null>(null);
  let result = $state<WriteResult | null>(null);
  let advice = $state<NextAction | null>(null);
  let cheerTimer: ReturnType<typeof setTimeout> | undefined;

  const name = $derived(status?.name || 'Bulle');
  const ready = $derived(status?.available === true);
  const limit = $derived<PlanLimitError | null>(
    status?.reason === 'plan_required' ? (planLimitFrom(status.planLimit) ?? {}) : null,
  );
  const reason = $derived(
    limit
      ? null
      : status && !status.available
        ? REASONS[status.reason === 'plan_required' ? 'unreachable' : (status.reason ?? 'unreachable')]
        : statusError
          ? REASONS.unreachable
          : null,
  );
  const hasBody = $derived(body.trim().length > 0);
  const mood = $derived<BulleMood>(reason ? 'unavailable' : busy ? 'thinking' : cheered ? 'done' : 'idle');

  async function loadStatus() {
    try {
      status = await assistantStatus(context.teamId);
    } catch {
      statusError = true;
    }
  }

  function cheer() {
    cheered = true;
    clearTimeout(cheerTimer);
    cheerTimer = setTimeout(() => (cheered = false), 1600);
  }

  async function ask(run: () => Promise<void>) {
    if (busy || !ready) return;
    busy = true;
    error = null;
    refused = null;
    try {
      await run();
      cheer();
    } catch (e) {
      refused = planLimitFrom((e as { data?: { plan_limit?: unknown } }).data?.plan_limit);
      error = refused ? null : getTrpcErrorMessage(e);
    } finally {
      busy = false;
    }
  }

  function write(action: WriteAction, language?: 'fr' | 'en') {
    const typed = instruction.trim();
    return ask(async () => {
      result = await trpc.assistant.write.mutate({
        teamId: context.teamId,
        personId: context.personId,
        companyId: context.companyId,
        action,
        instruction: typed || undefined,
        subject: subject.trim() || undefined,
        body: body.trim() || undefined,
        language,
      });
      instruction = '';
    });
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!instruction.trim()) return;
    if (task === 'next') return suggest();
    return write(hasBody ? 'rewrite' : 'draft');
  }

  function suggest() {
    return ask(async () => {
      advice = await trpc.assistant.nextAction.mutate({
        teamId: context.teamId,
        personId: context.personId,
        companyId: context.companyId,
      });
    });
  }

  function apply(mode: ApplyMode) {
    if (!result) return;
    onApply?.(result, mode);
    result = null;
  }

  onMount(loadStatus);
  onDestroy(() => clearTimeout(cheerTimer));
</script>

<section class="flex flex-col gap-4 {className}" aria-label={t('assistant.region', { name })} aria-busy={busy}>
  <header class="flex items-center gap-3">
    <BulleBlob {name} {mood} size={40} />
    <div class="min-w-0">
      <p class="text-fc-md font-semibold text-fc-fg">{name}</p>
      <p class="text-fc-xs text-fc-fg-muted" aria-live="polite">
        {#if !status && !statusError}{t('assistant.connecting')}{:else if reason || limit}{t('assistant.unavailable')}{:else if busy}{t('assistant.thinking')}{:else}{t('assistant.available')}{/if}
      </p>
    </div>
  </header>

  {#if limit}
    <PlanLimit error={limit} />
  {:else if reason}
    <Alert tone={status?.reason === 'unreachable' || statusError ? 'warning' : 'info'} title={t(reason.title)}>
      <p>{t(reason.text)}</p>
      {#if reason.link}
        <a class="mt-1 inline-block font-medium underline" href={BULLE_SETTINGS_URL} target="_blank" rel="external noopener noreferrer">{t(reason.link)}</a>
      {/if}
    </Alert>
  {:else if task === 'next'}
    <Button icon="solar:lightbulb-linear" onclick={suggest} disabled={busy || !ready}>
      {#if busy}<Spinner size="sm" />{/if}
      {t('assistant.nextAction')}
    </Button>
    {#if advice}
      <div class="flex flex-col gap-3 rounded-fc-md bg-fc-surface p-3">
        <p class="whitespace-pre-line text-fc-sm text-fc-fg">{advice.summary}</p>
        {#if advice.steps.length}
          <ol class="flex list-decimal flex-col gap-1 pl-5 text-fc-sm text-fc-fg">
            {#each advice.steps as step, i (i)}<li>{step}</li>{/each}
          </ol>
        {/if}
        {#if advice.draft && onUseDraft}
          {@const draft = advice.draft}
          <Button size="sm" variant="secondary" icon="solar:pen-new-square-linear" onclick={() => onUseDraft(draft)}>{t('assistant.useDraft')}</Button>
        {/if}
      </div>
    {/if}
  {:else}
    <div class="flex flex-wrap gap-2" role="group" aria-label={t('assistant.quick')}>
      {#each QUICK as q (q.action)}
        <Button size="sm" variant="secondary" disabled={busy || !ready || (q.needsBody && !hasBody)} onclick={() => write(q.action, q.language)}>{q.label}</Button>
      {/each}
    </div>
    <form class="flex gap-2" onsubmit={submit}>
      <label for={inputId} class="sr-only">{t('assistant.instructionFor', { name })}</label>
      <Input id={inputId} bind:value={instruction} maxlength={2000} placeholder={t('assistant.askPlaceholder', { name })} disabled={!ready} autocomplete="off" />
      <Button type="submit" icon="solar:plain-linear" aria-label={t('assistant.send')} disabled={busy || !ready || !instruction.trim()} />
    </form>
    {#if result}
      <div class="flex flex-col gap-2 rounded-fc-md bg-fc-surface p-3" aria-live="polite">
        {#if result.subject}<p class="text-fc-sm font-semibold text-fc-fg">{result.subject}</p>{/if}
        {#if result.body}<p class="max-h-64 overflow-auto whitespace-pre-line text-fc-sm text-fc-fg">{result.body}</p>{/if}
        {#if result.note}<p class="text-fc-xs text-fc-fg-muted">{result.note}</p>{/if}
        <div class="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="ghost" onclick={() => (result = null)}>{t('assistant.ignore')}</Button>
          {#if result.body}<Button size="sm" variant="secondary" onclick={() => apply('insert')}>{t('assistant.insert')}</Button>{/if}
          <Button size="sm" onclick={() => apply('replace')}>{t('assistant.replace')}</Button>
        </div>
      </div>
    {/if}
  {/if}

  {#if refused}<PlanLimit error={refused} />{/if}
  {#if error}<Alert tone="danger">{error}</Alert>{/if}
</section>
