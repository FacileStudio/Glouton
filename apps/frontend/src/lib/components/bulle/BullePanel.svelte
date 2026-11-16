<script lang="ts">
  import { onDestroy, onMount, type Snippet } from 'svelte';
  import { BullePanel as Shell, Button, Input, Spinner, Tooltip } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import {
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
    mood?: BulleMood;
    busy?: boolean;
    onApply?: (result: WriteResult, mode: ApplyMode) => void;
    onUseDraft?: (draft: NonNullable<NextAction['draft']>) => void;
    actions?: Snippet;
    class?: string;
  }

  let {
    task = 'write',
    context,
    subject = '',
    body = '',
    inputId = 'bulle-instruction',
    mood = $bindable('idle'),
    busy = $bindable(false),
    onApply,
    onUseDraft,
    actions,
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
  let cheered = $state(false);
  let instruction = $state('');
  let error = $state<string | null>(null);
  let upgradeHref = $state<string | undefined>(undefined);
  let result = $state<WriteResult | null>(null);
  let advice = $state<NextAction | null>(null);
  let last = $state<(() => Promise<void>) | null>(null);
  let cheerTimer: ReturnType<typeof setTimeout> | undefined;

  const name = $derived(status?.name || 'Bulle');
  const ready = $derived(status?.available === true);
  const gate = $derived(status?.reason === 'plan_required' ? (status.planLimit?.upgrade_url ?? '') : upgradeHref);
  const reason = $derived(
    status?.reason === 'plan_required'
      ? null
      : status && !status.available
        ? REASONS[status.reason ?? 'unreachable']
        : statusError
          ? REASONS.unreachable
          : null,
  );
  const hasBody = $derived(body.trim().length > 0);
  const shownError = $derived(reason ? `${t(reason.title)}. ${t(reason.text)}` : error);

  $effect(() => {
    mood = reason ? 'unavailable' : busy ? 'thinking' : cheered ? 'done' : 'idle';
  });

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
    last = run;
    busy = true;
    error = null;
    upgradeHref = undefined;
    try {
      await run();
      cheer();
    } catch (e) {
      const limit = (e as { data?: { plan_limit?: { upgrade_url?: string } } }).data?.plan_limit;
      if (limit) upgradeHref = limit.upgrade_url ?? '';
      else error = getTrpcErrorMessage(e);
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

<Shell {name} {busy} {mood} error={shownError} onRetry={reason || !last ? undefined : () => last?.()} upgradeHref={gate} {actions} class={className}>
  {#if task === 'next'}
    <div class="flex flex-col gap-3">
      <Button icon="solar:lightbulb-linear" onclick={suggest} disabled={busy || !ready} class="self-start">
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
    </div>
  {:else}
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap gap-2" role="group" aria-label={t('assistant.quick')}>
        {#each QUICK as q (q.action)}
          <Button size="sm" variant="secondary" disabled={busy || !ready || (q.needsBody && !hasBody)} onclick={() => write(q.action, q.language)}>{q.label}</Button>
        {/each}
      </div>
      <form class="flex gap-2" onsubmit={submit}>
        <label for={inputId} class="sr-only">{t('assistant.instructionFor', { name })}</label>
        <Input id={inputId} bind:value={instruction} maxlength={2000} placeholder={t('assistant.askPlaceholder', { name })} disabled={!ready} autocomplete="off" />
        <Tooltip text={t('assistant.send')} describe={false} class="contents">
          <Button type="submit" icon="solar:plain-linear" aria-label={t('assistant.send')} disabled={busy || !ready || !instruction.trim()} />
        </Tooltip>
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
    </div>
  {/if}
</Shell>
