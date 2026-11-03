<script lang="ts">
  import { page } from '$app/state';
  import { Badge, Button, Card, Field, Input, PageHeader, Select, Spinner, toast } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import ContactActivity from '$lib/components/contacts/ContactActivity.svelte';
  import {
    STAGES,
    askBulle,
    formatDate,
    originLabel,
    personName,
    stageOf,
    temperatureOf,
    type Stage,
  } from '$lib/components/contacts/labels';

  type Company = Awaited<ReturnType<typeof trpc.contact.getCompany.query>>;

  const id = $derived(page.params.id ?? '');

  let company = $state<Company | null>(null);
  let loading = $state(true);
  let changingStage = $state(false);
  let addingPerson = $state(false);
  let personForm = $state({ firstName: '', lastName: '', email: '', role: '' });
  let showPersonForm = $state(false);

  async function load() {
    try {
      company = await trpc.contact.getCompany.query({ id });
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      loading = false;
    }
  }

  async function changeStage(stage: Stage) {
    if (!company || stage === company.stage) return;
    changingStage = true;
    try {
      await trpc.contact.changeStage.mutate({ companyId: company.id, stage });
      await load();
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      changingStage = false;
    }
  }

  async function addPerson(event: SubmitEvent) {
    event.preventDefault();
    if (!company) return;
    addingPerson = true;
    try {
      await trpc.contact.createPerson.mutate({
        companyId: company.id,
        firstName: personForm.firstName || null,
        lastName: personForm.lastName || null,
        email: personForm.email || null,
        role: personForm.role || null,
      });
      personForm = { firstName: '', lastName: '', email: '', role: '' };
      showPersonForm = false;
      await load();
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      addingPerson = false;
    }
  }

  function bullePrompt(c: Company): string {
    return `Aide-moi avec l'entreprise ${c.name}${c.domain ? ` (${c.domain})` : ''} dans Glouton, id ${c.id}. Lis sa fiche et son historique, puis propose la prochaine action.`;
  }

  $effect(() => {
    void id;
    loading = true;
    load();
  });
</script>

{#if loading && !company}
  <Card class="flex items-center justify-center py-16"><Spinner size="lg" /></Card>
{:else if !company}
  <p class="text-fc-sm text-fc-fg-muted">Entreprise introuvable.</p>
{:else}
  {@const c = company}
  {@const st = stageOf(c.stage)}
  {@const temp = temperatureOf(c.temperature)}
  <PageHeader title={c.name} description={[c.domain, c.city, c.country].filter(Boolean).join(' · ')}>
    {#snippet actions()}
      <Button variant="outline" href="/app/contacts" icon="solar:arrow-left-linear">Contacts</Button>
      <Button variant="outline" icon="solar:chat-round-dots-linear" onclick={() => askBulle(bullePrompt(c))}>Demander à Bulle</Button>
    {/snippet}
  </PageHeader>

  <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
    <div class="flex flex-col gap-4 lg:col-span-1">
      <Card class="flex flex-col gap-4 p-5">
        <div class="flex flex-wrap gap-1.5">
          <Badge tone={st.tone}>{st.label}</Badge>
          {#if temp}<Badge tone={temp.tone}>{temp.label} · {c.score}</Badge>{/if}
          <Badge>{originLabel(c.origin)}</Badge>
          {#if c.ardoiseClientId}<Badge tone="success">Lié à Ardoise</Badge>{/if}
        </div>
        <Field label="Étape">
          <Select value={c.stage} disabled={changingStage} onchange={(e) => changeStage(e.currentTarget.value as Stage)}>
            {#each STAGES as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
          </Select>
        </Field>
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-fc-sm">
          {#if c.website || c.domain}
            <dt class="text-fc-fg-muted">Site</dt>
            <dd class="truncate"><a class="text-fc-fg underline" href={c.website ?? `https://${c.domain}`} target="_blank" rel="noopener noreferrer">{c.website ?? c.domain}</a></dd>
          {/if}
          {#if c.emails.length}<dt class="text-fc-fg-muted">E-mails</dt><dd class="break-all">{c.emails.join(', ')}</dd>{/if}
          {#if c.phones.length}<dt class="text-fc-fg-muted">Téléphones</dt><dd>{c.phones.join(', ')}</dd>{/if}
          {#if c.addressLine}<dt class="text-fc-fg-muted">Adresse</dt><dd>{[c.addressLine, c.postalCode, c.city].filter(Boolean).join(' ')}</dd>{/if}
          {#if c.siret}<dt class="text-fc-fg-muted">SIRET</dt><dd>{c.siret}</dd>{/if}
          {#if c.category}<dt class="text-fc-fg-muted">Catégorie</dt><dd>{c.category}</dd>{/if}
          <dt class="text-fc-fg-muted">Créée le</dt><dd>{formatDate(c.createdAt)}</dd>
        </dl>
        {#if c.legacyLeadId}
          <Button variant="ghost" size="sm" href="/app/leads/{c.legacyLeadId}" icon="solar:magnet-linear">Voir le lead d'origine</Button>
        {/if}
        {#if c.notes}<p class="whitespace-pre-line text-fc-sm text-fc-fg">{c.notes}</p>{/if}
      </Card>

      <Card class="flex flex-col gap-4 p-5">
        <div class="flex items-center justify-between">
          <h2 class="text-fc-md font-semibold text-fc-fg">Personnes</h2>
          <Button size="sm" variant="ghost" icon="mdi:plus" onclick={() => (showPersonForm = !showPersonForm)}>Ajouter</Button>
        </div>
        {#if showPersonForm}
          <form class="flex flex-col gap-3" onsubmit={addPerson}>
            <div class="grid grid-cols-2 gap-2">
              <Field label="Prénom"><Input bind:value={personForm.firstName} /></Field>
              <Field label="Nom"><Input bind:value={personForm.lastName} /></Field>
            </div>
            <Field label="E-mail"><Input type="email" bind:value={personForm.email} /></Field>
            <Field label="Fonction"><Input bind:value={personForm.role} /></Field>
            <Button type="submit" size="sm" disabled={addingPerson}>Enregistrer</Button>
          </form>
        {/if}
        {#if c.people.length === 0}
          <p class="text-fc-sm text-fc-fg-muted">Aucune personne.</p>
        {:else}
          <ul class="flex flex-col gap-1">
            {#each c.people as p (p.id)}
              <li>
                <a href="/app/contacts/people/{p.id}" class="flex min-h-11 flex-col justify-center rounded-fc-md px-2 hover:bg-fc-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring">
                  <span class="text-fc-sm text-fc-fg">{personName(p)}{p.isBillingContact ? ' · facturation' : ''}</span>
                  <span class="text-fc-xs text-fc-fg-muted">{[p.role, p.email].filter(Boolean).join(' · ')}</span>
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </Card>
    </div>

    <div class="flex flex-col gap-4 lg:col-span-2">
      <ContactActivity target={{ companyId: c.id }} activities={c.activities} suggestions={c.suggestions} onChange={load} />
      {#if c.outreach.length}
        <Card class="flex flex-col gap-3 p-5">
          <h2 class="text-fc-md font-semibold text-fc-fg">E-mails</h2>
          <ul class="flex flex-col gap-2">
            {#each c.outreach as o (o.id)}
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
