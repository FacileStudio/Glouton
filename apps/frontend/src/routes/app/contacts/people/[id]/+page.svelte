<script lang="ts">
  import { page } from '$app/state';
  import { Badge, Button, Card, Field, PageHeader, Select, Spinner, toast } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import ContactActivity from '$lib/components/contacts/ContactActivity.svelte';
  import { STAGES, askBulle, formatDate, originLabel, personName, stageOf, type Stage } from '$lib/components/contacts/labels';

  type Person = Awaited<ReturnType<typeof trpc.contact.getPerson.query>>;

  const id = $derived(page.params.id ?? '');

  let person = $state<Person | null>(null);
  let loading = $state(true);
  let changingStage = $state(false);

  async function load() {
    try {
      person = await trpc.contact.getPerson.query({ id });
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      loading = false;
    }
  }

  async function changeStage(stage: Stage) {
    if (!person || stage === person.stage) return;
    changingStage = true;
    try {
      await trpc.contact.changeStage.mutate({ personId: person.id, stage });
      await load();
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      changingStage = false;
    }
  }

  function bullePrompt(p: Person): string {
    const where = p.company ? ` chez ${p.company.name}` : '';
    return `Aide-moi avec ${personName(p)}${where} dans Glouton, personne id ${p.id}. Lis sa fiche et ses échanges, puis prépare un brouillon de prise de contact.`;
  }

  $effect(() => {
    void id;
    loading = true;
    load();
  });
</script>

{#if loading && !person}
  <Card class="flex items-center justify-center py-16"><Spinner size="lg" /></Card>
{:else if !person}
  <p class="text-fc-sm text-fc-fg-muted">Personne introuvable.</p>
{:else}
  {@const p = person}
  {@const st = stageOf(p.stage)}
  <PageHeader title={personName(p)} description={[p.role, p.company?.name].filter(Boolean).join(' · ')}>
    {#snippet actions()}
      {#if p.company}
        <Button variant="outline" href="/app/contacts/companies/{p.company.id}" icon="solar:buildings-2-linear">{p.company.name}</Button>
      {:else}
        <Button variant="outline" href="/app/contacts" icon="solar:arrow-left-linear">Contacts</Button>
      {/if}
      <Button variant="outline" icon="solar:chat-round-dots-linear" onclick={() => askBulle(bullePrompt(p))}>Demander à Bulle</Button>
    {/snippet}
  </PageHeader>

  <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
    <Card class="flex flex-col gap-4 p-5 lg:col-span-1">
      <div class="flex flex-wrap gap-1.5">
        <Badge tone={st.tone}>{st.label}</Badge>
        <Badge>{originLabel(p.origin)}</Badge>
        {#if p.emailVerified === true}<Badge tone="success">E-mail vérifié</Badge>{/if}
        {#if p.emailVerified === false}<Badge tone="danger">E-mail invalide</Badge>{/if}
      </div>
      <Field label="Étape">
        <Select value={p.stage} disabled={changingStage} onchange={(e) => changeStage(e.currentTarget.value as Stage)}>
          {#each STAGES as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
        </Select>
      </Field>
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-fc-sm">
        {#if p.email}<dt class="text-fc-fg-muted">E-mail</dt><dd class="break-all">{p.email}</dd>{/if}
        {#if p.emails.length}<dt class="text-fc-fg-muted">Autres</dt><dd class="break-all">{p.emails.join(', ')}</dd>{/if}
        {#if p.phones.length}<dt class="text-fc-fg-muted">Téléphones</dt><dd>{p.phones.join(', ')}</dd>{/if}
        <dt class="text-fc-fg-muted">Créée le</dt><dd>{formatDate(p.createdAt)}</dd>
      </dl>
      {#if p.notes}<p class="whitespace-pre-line text-fc-sm text-fc-fg">{p.notes}</p>{/if}
    </Card>

    <div class="flex flex-col gap-4 lg:col-span-2">
      <ContactActivity target={{ personId: p.id }} activities={p.activities} suggestions={p.suggestions} onChange={load} />
      {#if p.outreach.length}
        <Card class="flex flex-col gap-3 p-5">
          <h2 class="text-fc-md font-semibold text-fc-fg">E-mails</h2>
          <ul class="flex flex-col gap-2">
            {#each p.outreach as o (o.id)}
              <li class="flex flex-wrap items-center justify-between gap-2 text-fc-sm">
                <span class="min-w-0 truncate text-fc-fg">{o.subject}</span>
                <span class="flex items-center gap-2">
                  <Badge tone={o.status === 'DRAFT' ? 'warning' : o.status === 'FAILED' ? 'danger' : 'neutral'}>{o.status}</Badge>
                  <span class="text-fc-xs text-fc-fg-muted">{formatDate(o.sentAt ?? o.createdAt)}</span>
                </span>
              </li>
            {/each}
          </ul>
        </Card>
      {/if}
    </div>
  </div>
{/if}
