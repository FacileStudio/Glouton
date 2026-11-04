<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Alert, Button, Input, Spinner } from '@facile/muse';
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

  const QUICK: Array<{ action: WriteAction; label: string; needsBody?: boolean; language?: 'en' }> = [
    { action: 'draft', label: 'Rédiger' },
    { action: 'reply', label: 'Répondre' },
    { action: 'shorter', label: 'Plus court', needsBody: true },
    { action: 'warmer', label: 'Plus chaleureux', needsBody: true },
    { action: 'formal', label: 'Plus formel', needsBody: true },
    { action: 'fix', label: 'Corriger', needsBody: true },
    { action: 'translate', label: 'Traduire en anglais', needsBody: true, language: 'en' },
    { action: 'subject', label: 'Proposer un objet', needsBody: true },
  ];

  let status = $state<AssistantStatus | null>(null);
  let statusError = $state(false);
  let busy = $state(false);
  let cheered = $state(false);
  let instruction = $state('');
  let error = $state<string | null>(null);
  let result = $state<WriteResult | null>(null);
  let advice = $state<NextAction | null>(null);
  let cheerTimer: ReturnType<typeof setTimeout> | undefined;

  const name = $derived(status?.name || 'Bulle');
  const ready = $derived(status?.available === true);
  const reason = $derived(status && !status.available ? REASONS[status.reason ?? 'unreachable'] : statusError ? REASONS.unreachable : null);
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
    try {
      await run();
      cheer();
    } catch (e) {
      error = getTrpcErrorMessage(e);
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

<section class="flex flex-col gap-4 {className}" aria-label="Assistant {name}" aria-busy={busy}>
  <header class="flex items-center gap-3">
    <BulleBlob {name} {mood} size={40} />
    <div class="min-w-0">
      <p class="text-fc-md font-semibold text-fc-fg">{name}</p>
      <p class="text-fc-xs text-fc-fg-muted" aria-live="polite">
        {#if !status && !statusError}Connexion…{:else if reason}Indisponible{:else if busy}Réfléchit…{:else}Disponible{/if}
      </p>
    </div>
  </header>

  {#if reason}
    <Alert tone={status?.reason === 'unreachable' || statusError ? 'warning' : 'info'} title={reason.title}>
      <p>{reason.text}</p>
      {#if reason.link}
        <a class="mt-1 inline-block font-medium underline" href={BULLE_SETTINGS_URL} target="_blank" rel="external noopener noreferrer">{reason.link}</a>
      {/if}
    </Alert>
  {:else if task === 'next'}
    <Button icon="solar:lightbulb-linear" onclick={suggest} disabled={busy || !ready}>
      {#if busy}<Spinner size="sm" />{/if}
      Proposer la prochaine action
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
          <Button size="sm" variant="outline" icon="solar:pen-new-square-linear" onclick={() => onUseDraft(draft)}>Utiliser ce brouillon</Button>
        {/if}
      </div>
    {/if}
  {:else}
    <div class="flex flex-wrap gap-2" role="group" aria-label="Actions rapides">
      {#each QUICK as q (q.action)}
        <Button size="sm" variant="outline" disabled={busy || !ready || (q.needsBody && !hasBody)} onclick={() => write(q.action, q.language)}>{q.label}</Button>
      {/each}
    </div>
    <form class="flex gap-2" onsubmit={submit}>
      <label for={inputId} class="sr-only">Consigne pour {name}</label>
      <Input id={inputId} bind:value={instruction} maxlength={2000} placeholder="Demandez à {name}…" disabled={!ready} autocomplete="off" />
      <Button type="submit" icon="solar:plain-linear" aria-label="Envoyer la consigne" disabled={busy || !ready || !instruction.trim()} />
    </form>
    {#if result}
      <div class="flex flex-col gap-2 rounded-fc-md bg-fc-surface p-3" aria-live="polite">
        {#if result.subject}<p class="text-fc-sm font-semibold text-fc-fg">{result.subject}</p>{/if}
        {#if result.body}<p class="max-h-64 overflow-auto whitespace-pre-line text-fc-sm text-fc-fg">{result.body}</p>{/if}
        {#if result.note}<p class="text-fc-xs text-fc-fg-muted">{result.note}</p>{/if}
        <div class="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="ghost" onclick={() => (result = null)}>Ignorer</Button>
          {#if result.body}<Button size="sm" variant="outline" onclick={() => apply('insert')}>Insérer</Button>{/if}
          <Button size="sm" onclick={() => apply('replace')}>Remplacer</Button>
        </div>
      </div>
    {/if}
  {/if}

  {#if error}<Alert tone="danger">{error}</Alert>{/if}
</section>
