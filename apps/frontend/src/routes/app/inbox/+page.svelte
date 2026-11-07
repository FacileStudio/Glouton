<script lang="ts">
  import { resolve } from '$app/paths';
  import { onDestroy, onMount } from 'svelte';
  import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Spinner, Tabs, Textarea, toast } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { ws } from '$lib/websocket';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { inboxCount } from '$lib/stores/inbox-count.svelte';
  import { suggestionLabel, personName } from '$lib/components/contacts/labels';
  import Composer from '$lib/components/mail/Composer.svelte';
  import { useFormat, useT } from '$lib/i18n';

  const t = useT();
  const format = useFormat();
  type Draft = Awaited<ReturnType<typeof trpc.inbox.drafts.query>>[number];
  type Suggestion = Awaited<ReturnType<typeof trpc.inbox.suggestions.query>>[number];

  let tab = $state<'drafts' | 'suggestions'>('drafts');
  let drafts = $state<Draft[]>([]);
  let suggestions = $state<Suggestion[]>([]);
  let edits = $state<Record<string, { subject: string; text: string }>>({});
  let loading = $state(true);
  let busy = $state<string | null>(null);
  let composing = $state<Draft | null>(null);
  let composerOpen = $state(false);

  function openComposer(d: Draft) {
    composing = d;
    composerOpen = true;
  }

  function composed() {
    if (composing) delete edits[composing.id];
    return load();
  }

  async function load() {
    try {
      const [d, s] = await Promise.all([trpc.inbox.drafts.query(), trpc.inbox.suggestions.query()]);
      drafts = d;
      suggestions = s;
      edits = Object.fromEntries(d.map((x) => [x.id, edits[x.id] ?? { subject: x.subject, text: x.textBody }]));
      inboxCount.set(d.length + s.length);
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      loading = false;
    }
  }

  function dirty(d: Draft): boolean {
    const e = edits[d.id];
    return !!e && (e.subject !== d.subject || e.text !== d.textBody);
  }

  async function run(id: string, action: () => Promise<unknown>, success: string) {
    busy = id;
    try {
      await action();
      toast.success(success);
      await load();
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      busy = null;
    }
  }

  async function save(d: Draft) {
    const e = edits[d.id]!;
    await trpc.inbox.updateDraft.mutate({ id: d.id, data: { subject: e.subject, text: e.text } });
  }

  function saveDraft(d: Draft) {
    return run(d.id, () => save(d), t('inbox.draftSaved'));
  }

  function sendDraft(d: Draft) {
    return run(
      d.id,
      async () => {
        if (dirty(d)) await save(d);
        await trpc.email.sendDraft.mutate({ id: d.id });
      },
      t('inbox.sent')
    );
  }

  function discardDraft(d: Draft) {
    return run(d.id, () => trpc.inbox.discardDraft.mutate({ id: d.id }), t('inbox.draftDeleted'));
  }

  function decide(s: Suggestion, decision: 'ACCEPT' | 'DISMISS') {
    return run(
      s.id,
      () => trpc.inbox.decideSuggestion.mutate({ id: s.id, decision }),
      decision === 'ACCEPT' ? t('contacts.suggestionApplied') : t('contacts.suggestionDismissed')
    );
  }

  function authorLabel(value: string): string {
    if (value.startsWith('user:')) return t('common.you');
    return value === 'bulle' ? 'Bulle' : value;
  }

  const unsubscribers: Array<() => void> = [];

  onMount(() => {
    load();
    unsubscribers.push(ws.on('draft:new', () => load()), ws.on('suggestion:new', () => load()));
  });

  onDestroy(() => unsubscribers.forEach((u) => u()));
</script>

<PageHeader title={t('inbox.title')} description={t('inbox.subtitle')} />

<div class="flex flex-col gap-4">
  <Tabs
    label={t('inbox.content')}
    value={tab}
    onChange={(id) => (tab = id === 'suggestions' ? 'suggestions' : 'drafts')}
    items={[
      { id: 'drafts', label: t('inbox.drafts'), icon: 'solar:letter-linear', badge: drafts.length || undefined },
      { id: 'suggestions', label: t('inbox.suggestions'), icon: 'solar:lightbulb-linear', badge: suggestions.length || undefined },
    ]}
  />

  {#if loading}
    <Card class="flex items-center justify-center py-16"><Spinner size="lg" /></Card>
  {:else if tab === 'drafts'}
    {#if drafts.length === 0}
      <EmptyState icon="solar:letter-linear" title={t('inbox.noDrafts')} />
    {:else}
      {#each drafts as d (d.id)}
        <Card class="flex flex-col gap-4 p-5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-fc-sm text-fc-fg">
                {t('composer.to')}
                {#if d.person}
                  <a class="font-semibold underline" href={resolve('/app/contacts/people/[id]', { id: d.person.id })}>{personName(d.person, t)}</a>
                  {#if d.person.email}<span class="text-fc-fg-muted">&lt;{d.person.email}&gt;</span>{/if}
                {:else}
                  <span class="text-fc-fg-muted">{t('inbox.unknownRecipient')}</span>
                {/if}
                {#if d.company}
                  · <a class="underline" href={resolve('/app/contacts/companies/[id]', { id: d.company.id })}>{d.company.name}</a>
                {/if}
              </p>
              <p class="text-fc-xs text-fc-fg-muted">{d.origin === 'AGENT' ? t('inbox.proposedByBulle') : t('kind.DRAFT')} · {format.date(d.createdAt)}</p>
            </div>
            {#if d.person?.emailVerified === false}<Badge tone="danger">{t('inbox.invalidAddress')}</Badge>{/if}
          </div>
          {#if d.rationale}<p class="text-fc-xs text-fc-fg-muted">{d.rationale}</p>{/if}
          {#if edits[d.id]}
            <Field label={t('inbox.subject')}><Input bind:value={edits[d.id]!.subject} maxlength={300} /></Field>
            <Field label={t('inbox.message')}><Textarea bind:value={edits[d.id]!.text} rows={8} /></Field>
          {/if}
          <div class="flex flex-wrap justify-end gap-2">
            <Button variant="ghost-danger" onclick={() => discardDraft(d)} disabled={busy === d.id}>{t('hunts.deleteShort')}</Button>
            <Button variant="ghost" icon="solar:magic-stick-3-linear" onclick={() => openComposer(d)} disabled={busy === d.id || !d.person}>Modifier avec Bulle</Button>
            <Button variant="outline" onclick={() => saveDraft(d)} disabled={busy === d.id || !dirty(d)}>{t('common.save')}</Button>
            <Button icon="solar:plain-linear" onclick={() => sendDraft(d)} disabled={busy === d.id || !d.person?.email}>
              {#if busy === d.id}<Spinner size="sm" />{/if}
              {t('common.send')}
            </Button>
          </div>
        </Card>
      {/each}
    {/if}
  {:else if suggestions.length === 0}
    <EmptyState icon="solar:lightbulb-linear" title={t('inbox.noSuggestions')} />
  {:else}
    {#each suggestions as s (s.id)}
      <Card class="flex flex-col gap-3 p-5">
        <div class="flex flex-wrap items-center gap-2">
          <Badge tone="accent">{suggestionLabel(s.kind, t)}</Badge>
          <span class="text-fc-sm font-semibold text-fc-fg">{s.title}</span>
        </div>
        <p class="text-fc-xs text-fc-fg-muted">
          {authorLabel(s.createdBy)} · {format.date(s.createdAt)}
          {#if s.company} · <a class="underline" href={resolve('/app/contacts/companies/[id]', { id: s.company.id })}>{s.company.name}</a>{/if}
          {#if s.person} · <a class="underline" href={resolve('/app/contacts/people/[id]', { id: s.person.id })}>{personName(s.person, t)}</a>{/if}
        </p>
        {#if s.body}<p class="whitespace-pre-line text-fc-sm text-fc-fg">{s.body}</p>{/if}
        {#if s.rationale}<p class="text-fc-xs text-fc-fg-muted">{s.rationale}</p>{/if}
        <div class="flex justify-end gap-2">
          <Button variant="ghost" onclick={() => decide(s, 'DISMISS')} disabled={busy === s.id}>{t('contacts.dismiss')}</Button>
          <Button onclick={() => decide(s, 'ACCEPT')} disabled={busy === s.id}>{t('contacts.accept')}</Button>
        </div>
      </Card>
    {/each}
  {/if}
</div>

{#if composing?.person}
  <Composer
    bind:open={composerOpen}
    person={{ ...composing.person, companyName: composing.company?.name }}
    companyId={composing.company?.id}
    draft={{ id: composing.id, subject: edits[composing.id]?.subject ?? composing.subject, text: edits[composing.id]?.text ?? composing.textBody }}
    onDone={composed}
  />
{/if}
