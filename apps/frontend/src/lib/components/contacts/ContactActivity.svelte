<script lang="ts">
  import { Badge, Button, Card, Spinner, Textarea, toast } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { suggestionLabel } from './labels';
  import { useFormat, useT } from '$lib/i18n';

  const t = useT();
  const format = useFormat();
  type Activity = {
    id?: string;
    kind?: string;
    summary?: string;
    actor?: string | null;
    occurredAt?: string | Date;
    payload?: unknown;
  };
  type Suggestion = { id?: string; kind?: string; title?: string; body?: string | null; rationale?: string | null };

  let {
    target,
    activities,
    suggestions,
    onChange,
  }: {
    target: { companyId?: string; personId?: string };
    activities: Activity[];
    suggestions: Suggestion[];
    onChange: () => void | Promise<void>;
  } = $props();

  let note = $state('');
  let savingNote = $state(false);
  let deciding = $state<string | null>(null);

  const KIND_ICONS: Record<string, string> = {
    note: 'solar:notes-linear',
    'stage.changed': 'solar:route-linear',
    'email.sent': 'solar:letter-linear',
    'email.replied': 'solar:inbox-in-linear',
    'contact.merged': 'solar:users-group-two-rounded-linear',
    'contact.imported': 'solar:import-linear',
    'ardoise.client.linked': 'solar:link-linear',
    'ardoise.client.unlinked': 'solar:link-broken-linear',
    'ardoise.sync_failed': 'solar:danger-triangle-linear',
    'ardoise.quote_generated': 'solar:document-text-linear',
    'ardoise.quote_accepted': 'solar:check-circle-linear',
    'ardoise.invoice_generated': 'solar:bill-list-linear',
    'ardoise.payment_created': 'solar:wallet-money-linear',
  };

  function linkOf(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object' || !('url' in payload)) return null;
    const url = (payload as { url?: unknown }).url;
    return typeof url === 'string' && url.startsWith('https://') ? url : null;
  }

  function actorText(actor: string | null): string {
    if (!actor || actor.startsWith('user:')) return t('common.you');
    if (actor === 'bulle') return 'Bulle';
    return actor === 'ardoise' ? 'Ardoise' : actor;
  }

  async function addNote(event: SubmitEvent) {
    event.preventDefault();
    if (!note.trim()) return;
    savingNote = true;
    try {
      await trpc.contact.addNote.mutate({ ...target, text: note.trim() });
      note = '';
      await onChange();
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      savingNote = false;
    }
  }

  async function decide(id: string, decision: 'ACCEPT' | 'DISMISS') {
    deciding = id;
    try {
      await trpc.inbox.decideSuggestion.mutate({ id, decision });
      toast.success(decision === 'ACCEPT' ? t('contacts.suggestionApplied') : t('contacts.suggestionDismissed'));
      await onChange();
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      deciding = null;
    }
  }
</script>

{#if suggestions.length > 0}
  <Card class="flex flex-col gap-4 p-5">
    <h2 class="text-fc-md font-semibold text-fc-fg">{t('contacts.openSuggestions')}</h2>
    <ul class="flex flex-col gap-3">
      {#each suggestions as s (s.id)}
        <li class="flex flex-col gap-2 pb-3 last:pb-0">
          <div class="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{suggestionLabel(s.kind ?? '', t)}</Badge>
            <span class="text-fc-sm font-semibold text-fc-fg">{s.title}</span>
          </div>
          {#if s.body}<p class="whitespace-pre-line text-fc-sm text-fc-fg">{s.body}</p>{/if}
          {#if s.rationale}<p class="text-fc-xs text-fc-fg-muted">{s.rationale}</p>{/if}
          <div class="flex gap-2">
            <Button size="sm" onclick={() => decide(s.id ?? '', 'ACCEPT')} disabled={deciding === s.id}>{t('contacts.accept')}</Button>
            <Button size="sm" variant="ghost" onclick={() => decide(s.id ?? '', 'DISMISS')} disabled={deciding === s.id}>{t('contacts.dismiss')}</Button>
          </div>
        </li>
      {/each}
    </ul>
  </Card>
{/if}

<Card class="flex flex-col gap-4 p-5">
  <h2 class="text-fc-md font-semibold text-fc-fg">{t('contacts.history')}</h2>
  <form class="flex flex-col gap-2" onsubmit={addNote}>
    <Textarea bind:value={note} rows={2} placeholder={t('contacts.addNotePlaceholder')} aria-label={t('contacts.newNote')} maxlength={5000} />
    <div class="flex justify-end">
      <Button type="submit" size="sm" disabled={savingNote || !note.trim()}>
        {#if savingNote}<Spinner size="sm" />{/if}
        {t('contacts.addNote')}
      </Button>
    </div>
  </form>
  {#if activities.length === 0}
    <p class="text-fc-sm text-fc-fg-muted">{t('contacts.nothing')}</p>
  {:else}
    <ol class="flex flex-col gap-3">
      {#each activities as a (a.id)}
        <li class="flex gap-3">
          <iconify-icon
            icon={KIND_ICONS[a.kind ?? ''] ?? 'solar:history-linear'}
            width="18"
            height="18"
            class="mt-0.5 block shrink-0 text-fc-fg-muted"
          ></iconify-icon>
          <div class="min-w-0">
            <p class="whitespace-pre-line text-fc-sm text-fc-fg">{a.summary}</p>
            {#if linkOf(a.payload)}
              <a href={linkOf(a.payload)} target="_blank" rel="external noopener noreferrer" class="text-fc-xs text-fc-fg underline">{t('contacts.viewArdoise')}</a>
            {/if}
            <p class="text-fc-xs text-fc-fg-muted">{actorText(a.actor ?? null)} · {format.date(a.occurredAt)}</p>
          </div>
        </li>
      {/each}
    </ol>
  {/if}
</Card>
