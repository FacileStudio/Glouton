<script module lang="ts">
  export interface Recipient {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    companyName?: string | null;
  }

  export interface ComposerMessage {
    personId: string;
    subject: string;
    text: string;
  }
</script>

<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { resolve } from '$app/paths';
  import { MediaQuery } from 'svelte/reactivity';
  import { Badge, Button, Drawer, Field, Input, Modal, Select, Spinner, Textarea, toast } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { personName } from '$lib/components/contacts/labels';
  import BullePanel from '$lib/components/bulle/BullePanel.svelte';
  import type { ApplyMode, WriteResult } from '$lib/components/bulle/status';

  type Template = Awaited<ReturnType<typeof trpc.email.getTemplates.query>>[number];
  type Transport = Awaited<ReturnType<typeof trpc.email.getSmtpStatus.query>>;

  interface Props {
    open?: boolean;
    person?: Recipient | null;
    people?: Recipient[];
    companyId?: string;
    draft?: { id: string; subject: string; text: string } | null;
    initial?: { subject: string; body: string } | null;
    onSend?: (message: ComposerMessage) => Promise<void>;
    onDone?: () => void;
  }

  let {
    open = $bindable(false),
    person = null,
    people = [],
    companyId,
    draft = null,
    initial = null,
    onSend,
    onDone,
  }: Props = $props();

  const uid = $props.id();
  const bodyId = `${uid}-body`;
  const bulleInputId = `${uid}-bulle`;
  const desktop = new MediaQuery('(min-width: 1024px)');
  const teamId = $derived(teamContextStore.getTeamId());

  let subject = $state('');
  let body = $state('');
  let draftId = $state<string | null>(null);
  let personId = $state('');
  let templateId = $state('');
  let templates = $state<Template[]>([]);
  let transport = $state<Transport | null>(null);
  let busy = $state<'save' | 'send' | 'template' | null>(null);
  let bulleShown = $state(true);
  let sheetOpen = $state(false);

  const recipients = $derived(person ? [person] : people);
  const recipient = $derived(recipients.find((r) => r.id === personId) ?? null);
  const transportReady = $derived(onSend ? true : transport?.configured === true);
  const complete = $derived(Boolean(recipient && subject.trim() && body.trim()));
  const canSend = $derived(complete && Boolean(recipient?.email) && transportReady && !busy);
  const canSave = $derived(!onSend && complete && !busy);
  const bulleContext = $derived({ teamId, personId: personId || undefined, companyId });

  $effect(() => {
    if (open) untrack(reset);
  });

  function reset() {
    subject = draft?.subject ?? initial?.subject ?? '';
    body = draft?.text ?? initial?.body ?? '';
    draftId = draft?.id ?? null;
    personId = person?.id ?? people.find((p) => p.email)?.id ?? people[0]?.id ?? '';
    templateId = '';
    void loadMeta();
  }

  async function loadMeta() {
    try {
      const [t, s] = await Promise.all([
        templates.length ? templates : trpc.email.getTemplates.query(),
        trpc.email.getSmtpStatus.query({ teamId }),
      ]);
      templates = [...t];
      transport = s;
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    }
  }

  function variable(key: string): string {
    if (key === 'recipientName' && recipient) return recipient.firstName || personName(recipient);
    if (key === 'companyName' && recipient?.companyName) return recipient.companyName;
    return `{{${key}}}`;
  }

  async function applyTemplate(id: string) {
    templateId = id;
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    busy = 'template';
    try {
      const variables = Object.fromEntries(template.variables.map((key) => [key, variable(key)]));
      const preview = await trpc.email.previewEmail.query({ templateId: id, variables });
      subject = preview.subject;
      body = preview.text;
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      busy = null;
    }
  }

  function applyBulle(result: WriteResult, mode: ApplyMode) {
    if (mode === 'replace') {
      if (result.subject) subject = result.subject;
      if (result.body) body = result.body;
      return;
    }
    if (result.subject && !subject.trim()) subject = result.subject;
    if (!result.body) return;
    const el = document.getElementById(bodyId) as HTMLTextAreaElement | null;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    body = `${body.slice(0, start)}${result.body}${body.slice(end)}`;
  }

  async function persist(): Promise<string> {
    const data = { subject: subject.trim(), text: body };
    if (draftId) {
      await trpc.inbox.updateDraft.mutate({ id: draftId, data });
      return draftId;
    }
    const created = await trpc.inbox.createDraft.mutate({ personId, ...data });
    draftId = created.id;
    return created.id;
  }

  async function save() {
    if (!canSave) return;
    busy = 'save';
    try {
      await persist();
      toast.success('Brouillon enregistré');
      onDone?.();
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      busy = null;
    }
  }

  async function send() {
    if (!canSend) return;
    busy = 'send';
    try {
      if (onSend) await onSend({ personId, subject: subject.trim(), text: body });
      else await trpc.email.sendDraft.mutate({ id: await persist() });
      toast.success('E-mail envoyé');
      open = false;
      onDone?.();
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      busy = null;
    }
  }

  async function focusBulle() {
    if (desktop.current) bulleShown = true;
    else sheetOpen = true;
    await tick();
    requestAnimationFrame(() => document.getElementById(bulleInputId)?.focus());
  }

  function onKeydown(event: KeyboardEvent) {
    if (!open || !(event.metaKey || event.ctrlKey)) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      void send();
    } else if (event.key.toLowerCase() === 'j') {
      event.preventDefault();
      void focusBulle();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#snippet bulle()}
  <BullePanel context={bulleContext} {subject} {body} inputId={bulleInputId} onApply={applyBulle} />
{/snippet}

<Modal bind:open title={draft ? 'Modifier le brouillon' : 'Nouvel e-mail'} showClose class="max-w-5xl">
  <div class="grid grid-cols-1 gap-5 {desktop.current && bulleShown ? 'lg:grid-cols-[minmax(0,1fr)_20rem]' : ''}">
    <form class="flex min-w-0 flex-col gap-4" onsubmit={(e) => { e.preventDefault(); void send(); }}>
      {#if person}
        <Field label="À">
          {#snippet children({ id })}
            <p {id} class="text-fc-sm text-fc-fg">
              {personName(person)}
              {#if person.email}<span class="text-fc-fg-muted">&lt;{person.email}&gt;</span>{/if}
            </p>
          {/snippet}
        </Field>
      {:else}
        <Field label="À" error={recipients.length === 0 ? 'Ajoutez d’abord une personne' : undefined}>
          <Select bind:value={personId} disabled={recipients.length === 0}>
            {#each recipients as r (r.id)}
              <option value={r.id}>{personName(r)}{r.email ? ` <${r.email}>` : ' (sans e-mail)'}</option>
            {/each}
          </Select>
        </Field>
      {/if}
      {#if recipient && !recipient.email}
        <p class="text-fc-xs text-fc-danger" role="status">Cette personne n’a pas d’adresse e-mail.</p>
      {/if}

      {#if templates.length}
        <Field label="Modèle">
          <Select value={templateId} disabled={busy !== null} onchange={(e) => applyTemplate(e.currentTarget.value)}>
            <option value="">Sans modèle</option>
            {#each templates as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
          </Select>
        </Field>
      {/if}

      <Field label="Objet"><Input bind:value={subject} maxlength={300} autocomplete="off" /></Field>
      <Field label="Message"><Textarea id={bodyId} bind:value={body} rows={12} maxlength={50000} /></Field>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-2">
          {#if !onSend && transport}
            {#if transport.configured}
              <Badge tone="success">Envoi via {transport.transport === 'courrier' ? 'Courrier' : 'SMTP'}</Badge>
            {:else}
              <a href={resolve('/app/settings')} class="rounded-fc-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring">
                <Badge tone="danger">Envoi non configuré</Badge>
              </a>
            {/if}
          {/if}
          <Button
            size="sm"
            variant="ghost"
            icon="solar:magic-stick-3-linear"
            aria-expanded={desktop.current ? bulleShown : sheetOpen}
            onclick={() => (desktop.current ? (bulleShown = !bulleShown) : (sheetOpen = true))}
          >
            {desktop.current && bulleShown ? 'Masquer Bulle' : 'Bulle'}
          </Button>
        </div>
        <div class="flex flex-wrap gap-2">
          {#if !onSend}
            <Button variant="outline" onclick={save} disabled={!canSave}>
              {#if busy === 'save'}<Spinner size="sm" />{/if}
              Enregistrer le brouillon
            </Button>
          {/if}
          <Button type="submit" icon="solar:plain-linear" disabled={!canSend}>
            {#if busy === 'send'}<Spinner size="sm" />{/if}
            Envoyer
          </Button>
        </div>
      </div>
      {#if desktop.current}
        <p class="text-fc-xs text-fc-fg-muted">Ctrl ou ⌘ + Entrée pour envoyer · Ctrl ou ⌘ + J pour Bulle</p>
      {/if}
    </form>

    {#if desktop.current && bulleShown}
      <aside class="border-l border-fc-border pl-5">{@render bulle()}</aside>
    {/if}
  </div>

  {#if !desktop.current}
    <Drawer bind:open={sheetOpen} title="Bulle" showClose>{@render bulle()}</Drawer>
  {/if}
</Modal>
