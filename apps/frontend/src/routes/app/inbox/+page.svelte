<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Spinner, Tabs, Textarea, toast } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { ws } from '$lib/websocket';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { inboxCount } from '$lib/stores/inbox-count.svelte';
  import { SUGGESTION_KINDS, formatDate, personName } from '$lib/components/contacts/labels';

  type Draft = Awaited<ReturnType<typeof trpc.inbox.drafts.query>>[number];
  type Suggestion = Awaited<ReturnType<typeof trpc.inbox.suggestions.query>>[number];

  let tab = $state<'drafts' | 'suggestions'>('drafts');
  let drafts = $state<Draft[]>([]);
  let suggestions = $state<Suggestion[]>([]);
  let edits = $state<Record<string, { subject: string; text: string }>>({});
  let loading = $state(true);
  let busy = $state<string | null>(null);

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
    return run(d.id, () => save(d), 'Brouillon enregistré');
  }

  function sendDraft(d: Draft) {
    return run(
      d.id,
      async () => {
        if (dirty(d)) await save(d);
        await trpc.email.sendDraft.mutate({ id: d.id });
      },
      'E-mail envoyé'
    );
  }

  function discardDraft(d: Draft) {
    return run(d.id, () => trpc.inbox.discardDraft.mutate({ id: d.id }), 'Brouillon supprimé');
  }

  function decide(s: Suggestion, decision: 'ACCEPT' | 'DISMISS') {
    return run(
      s.id,
      () => trpc.inbox.decideSuggestion.mutate({ id: s.id, decision }),
      decision === 'ACCEPT' ? 'Suggestion appliquée' : 'Suggestion écartée'
    );
  }

  function authorLabel(value: string): string {
    if (value.startsWith('user:')) return 'Vous';
    return value === 'bulle' ? 'Bulle' : value;
  }

  const unsubscribers: Array<() => void> = [];

  onMount(() => {
    load();
    unsubscribers.push(ws.on('draft:new', () => load()), ws.on('suggestion:new', () => load()));
  });

  onDestroy(() => unsubscribers.forEach((u) => u()));
</script>

<PageHeader title="Boîte de l'agent" description="Brouillons et suggestions à valider. Rien ne part sans votre clic." />

<div class="flex flex-col gap-4">
  <Tabs
    label="Contenu de la boîte"
    value={tab}
    onChange={(id) => (tab = id === 'suggestions' ? 'suggestions' : 'drafts')}
    items={[
      { id: 'drafts', label: 'Brouillons', icon: 'solar:letter-linear', badge: drafts.length || undefined },
      { id: 'suggestions', label: 'Suggestions', icon: 'solar:lightbulb-linear', badge: suggestions.length || undefined },
    ]}
  />

  {#if loading}
    <Card class="flex items-center justify-center py-16"><Spinner size="lg" /></Card>
  {:else if tab === 'drafts'}
    {#if drafts.length === 0}
      <EmptyState icon="solar:letter-linear" title="Aucun brouillon en attente" />
    {:else}
      {#each drafts as d (d.id)}
        <Card class="flex flex-col gap-4 p-5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-fc-sm text-fc-fg">
                À
                {#if d.person}
                  <a class="font-semibold underline" href="/app/contacts/people/{d.person.id}">{personName(d.person)}</a>
                  {#if d.person.email}<span class="text-fc-fg-muted">&lt;{d.person.email}&gt;</span>{/if}
                {:else}
                  <span class="text-fc-fg-muted">destinataire inconnu</span>
                {/if}
                {#if d.company}
                  · <a class="underline" href="/app/contacts/companies/{d.company.id}">{d.company.name}</a>
                {/if}
              </p>
              <p class="text-fc-xs text-fc-fg-muted">{d.origin === 'AGENT' ? 'Proposé par Bulle' : 'Brouillon'} · {formatDate(d.createdAt)}</p>
            </div>
            {#if d.person?.emailVerified === false}<Badge tone="danger">Adresse invalide</Badge>{/if}
          </div>
          {#if d.rationale}<p class="text-fc-xs text-fc-fg-muted">{d.rationale}</p>{/if}
          {#if edits[d.id]}
            <Field label="Objet"><Input bind:value={edits[d.id]!.subject} maxlength={300} /></Field>
            <Field label="Message"><Textarea bind:value={edits[d.id]!.text} rows={8} /></Field>
          {/if}
          <div class="flex flex-wrap justify-end gap-2">
            <Button variant="ghost-danger" onclick={() => discardDraft(d)} disabled={busy === d.id}>Supprimer</Button>
            <Button variant="outline" onclick={() => saveDraft(d)} disabled={busy === d.id || !dirty(d)}>Enregistrer</Button>
            <Button icon="solar:plain-linear" onclick={() => sendDraft(d)} disabled={busy === d.id || !d.person?.email}>
              {#if busy === d.id}<Spinner size="sm" />{/if}
              Envoyer
            </Button>
          </div>
        </Card>
      {/each}
    {/if}
  {:else if suggestions.length === 0}
    <EmptyState icon="solar:lightbulb-linear" title="Aucune suggestion ouverte" />
  {:else}
    {#each suggestions as s (s.id)}
      <Card class="flex flex-col gap-3 p-5">
        <div class="flex flex-wrap items-center gap-2">
          <Badge tone="accent">{SUGGESTION_KINDS[s.kind] ?? s.kind}</Badge>
          <span class="text-fc-sm font-semibold text-fc-fg">{s.title}</span>
        </div>
        <p class="text-fc-xs text-fc-fg-muted">
          {authorLabel(s.createdBy)} · {formatDate(s.createdAt)}
          {#if s.company} · <a class="underline" href="/app/contacts/companies/{s.company.id}">{s.company.name}</a>{/if}
          {#if s.person} · <a class="underline" href="/app/contacts/people/{s.person.id}">{personName(s.person)}</a>{/if}
        </p>
        {#if s.body}<p class="whitespace-pre-line text-fc-sm text-fc-fg">{s.body}</p>{/if}
        {#if s.rationale}<p class="text-fc-xs text-fc-fg-muted">{s.rationale}</p>{/if}
        <div class="flex justify-end gap-2">
          <Button variant="ghost" onclick={() => decide(s, 'DISMISS')} disabled={busy === s.id}>Écarter</Button>
          <Button onclick={() => decide(s, 'ACCEPT')} disabled={busy === s.id}>Accepter</Button>
        </div>
      </Card>
    {/each}
  {/if}
</div>
