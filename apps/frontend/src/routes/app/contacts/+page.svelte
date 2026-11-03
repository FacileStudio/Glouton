<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    Badge,
    Button,
    Card,
    EmptyState,
    Field,
    Input,
    Modal,
    PageHeader,
    Select,
    Spinner,
    Tabs,
    Textarea,
    toast,
  } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import {
    ORIGINS,
    STAGES,
    TEMPERATURES,
    formatDate,
    originLabel,
    personName,
    stageOf,
    temperatureOf,
    type Origin,
    type Stage,
    type Temperature,
  } from '$lib/components/contacts/labels';

  type CompanyList = Awaited<ReturnType<typeof trpc.contact.listCompanies.query>>;
  type PeopleList = Awaited<ReturnType<typeof trpc.contact.listPeople.query>>;

  const PAGE = 25;
  const teamId = $derived(teamContextStore.getTeamId());

  let tab = $state<'companies' | 'people'>('companies');
  let q = $state('');
  let stage = $state<'' | Stage>('');
  let temperature = $state<'' | Temperature>('');
  let origin = $state<'' | Origin>('');

  let companies = $state<CompanyList['items']>([]);
  let people = $state<PeopleList['items']>([]);
  let total = $state(0);
  let loading = $state(true);
  let loadingMore = $state(false);

  let addOpen = $state(false);
  let saving = $state(false);
  let form = $state(emptyForm());

  function emptyForm() {
    return {
      name: '',
      domain: '',
      city: '',
      stage: 'PROSPECT' as Stage,
      notes: '',
      firstName: '',
      lastName: '',
      email: '',
      role: '',
    };
  }

  function filters(offset: number) {
    return {
      teamId,
      q: q.trim() || undefined,
      stage: stage || undefined,
      temperature: temperature || undefined,
      origin: origin || undefined,
      limit: PAGE,
      offset,
    };
  }

  async function load(append = false) {
    const offset = append ? (tab === 'companies' ? companies.length : people.length) : 0;
    if (append) loadingMore = true;
    else loading = true;
    try {
      if (tab === 'companies') {
        const res = await trpc.contact.listCompanies.query(filters(offset));
        companies = append ? [...companies, ...res.items] : res.items;
        total = res.total;
      } else {
        const res = await trpc.contact.listPeople.query(filters(offset));
        people = append ? [...people, ...res.items] : res.items;
        total = res.total;
      }
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  function onSearch(value: string) {
    q = value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => load(), 300);
  }

  function selectTab(id: string) {
    tab = id === 'people' ? 'people' : 'companies';
    load();
  }

  async function addContact(event: SubmitEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.danger("Le nom de l'entreprise est requis");
      return;
    }
    saving = true;
    try {
      const hasPerson = form.firstName || form.lastName || form.email;
      const duplicates = await trpc.contact.checkDuplicates.query({
        domain: form.domain || undefined,
        email: form.email || undefined,
      }).catch(() => null);
      if (duplicates && (duplicates.companies.length || duplicates.people.length)) {
        toast.warning('Un contact similaire existe déjà, vérifiez avant de fusionner');
      }
      const company = await trpc.contact.createCompany.mutate({
        name: form.name,
        domain: form.domain || null,
        city: form.city || null,
        stage: form.stage,
        notes: form.notes || null,
        teamId: teamId ?? null,
        people: hasPerson
          ? [{ firstName: form.firstName || null, lastName: form.lastName || null, email: form.email || null, role: form.role || null }]
          : [],
      });
      toast.success('Contact ajouté');
      addOpen = false;
      form = emptyForm();
      await goto(`/app/contacts/companies/${company.id}`);
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      saving = false;
    }
  }

  const shown = $derived(tab === 'companies' ? companies.length : people.length);

  onMount(() => load());
</script>

<PageHeader title="Contacts" description="{total} {tab === 'companies' ? 'entreprise' : 'personne'}{total !== 1 ? 's' : ''}">
  {#snippet actions()}
    <Button icon="mdi:plus" onclick={() => (addOpen = true)}>Ajouter un contact</Button>
  {/snippet}
</PageHeader>

<div class="flex flex-col gap-4">
  <Tabs
    label="Type de contact"
    value={tab}
    onChange={selectTab}
    items={[
      { id: 'companies', label: 'Entreprises', icon: 'solar:buildings-2-linear' },
      { id: 'people', label: 'Personnes', icon: 'solar:user-linear' },
    ]}
  />

  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <Input
      type="search"
      placeholder="Rechercher un nom, un domaine, une ville"
      aria-label="Rechercher"
      value={q}
      oninput={(e) => onSearch(e.currentTarget.value)}
    />
    <Select aria-label="Étape" value={stage} onchange={(e) => { stage = e.currentTarget.value as '' | Stage; load(); }}>
      <option value="">Toutes les étapes</option>
      {#each STAGES as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
    </Select>
    <Select aria-label="Température" value={temperature} onchange={(e) => { temperature = e.currentTarget.value as '' | Temperature; load(); }}>
      <option value="">Toutes les températures</option>
      {#each TEMPERATURES as t (t.value)}<option value={t.value}>{t.label}</option>{/each}
    </Select>
    <Select aria-label="Origine" value={origin} onchange={(e) => { origin = e.currentTarget.value as '' | Origin; load(); }}>
      <option value="">Toutes les origines</option>
      {#each ORIGINS as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
    </Select>
  </div>

  {#if loading}
    <Card class="flex items-center justify-center py-16"><Spinner size="lg" /></Card>
  {:else if shown === 0}
    <EmptyState
      icon="solar:users-group-rounded-linear"
      title={q || stage || temperature || origin ? 'Aucun contact ne correspond à vos filtres' : 'Aucun contact pour le moment'}
    />
  {:else if tab === 'companies'}
    <ul class="flex flex-col gap-2">
      {#each companies as c (c.id)}
        {@const st = stageOf(c.stage)}
        {@const temp = temperatureOf(c.temperature)}
        <li>
          <a
            href="/app/contacts/companies/{c.id}"
            class="flex min-h-11 flex-col gap-2 rounded-fc-lg bg-fc-component p-4 transition-colors hover:bg-fc-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0">
              <p class="truncate text-fc-sm font-semibold text-fc-fg">{c.name}</p>
              <p class="truncate text-fc-xs text-fc-fg-muted">
                {[c.domain, c.city, `${c.peopleCount} personne${c.peopleCount !== 1 ? 's' : ''}`].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              <Badge tone={st.tone}>{st.label}</Badge>
              {#if temp}<Badge tone={temp.tone}>{temp.label} · {c.score}</Badge>{/if}
              <Badge>{originLabel(c.origin)}</Badge>
              {#if c.lastContactedAt}<span class="text-fc-xs text-fc-fg-muted">Contacté le {formatDate(c.lastContactedAt)}</span>{/if}
            </div>
          </a>
        </li>
      {/each}
    </ul>
  {:else}
    <ul class="flex flex-col gap-2">
      {#each people as p (p.id)}
        {@const st = stageOf(p.stage)}
        <li>
          <a
            href="/app/contacts/people/{p.id}"
            class="flex min-h-11 flex-col gap-2 rounded-fc-lg bg-fc-component p-4 transition-colors hover:bg-fc-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0">
              <p class="truncate text-fc-sm font-semibold text-fc-fg">{personName(p)}</p>
              <p class="truncate text-fc-xs text-fc-fg-muted">
                {[p.role, p.company?.name, p.email].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              <Badge tone={st.tone}>{st.label}</Badge>
              <Badge>{originLabel(p.origin)}</Badge>
            </div>
          </a>
        </li>
      {/each}
    </ul>
  {/if}

  {#if !loading && shown < total}
    <div class="flex justify-center">
      <Button variant="outline" onclick={() => load(true)} disabled={loadingMore}>
        {#if loadingMore}<Spinner size="sm" />{/if}
        Afficher plus
      </Button>
    </div>
  {/if}
</div>

<Modal open={addOpen} title="Ajouter un contact" onClose={() => (addOpen = false)}>
  <form id="add-contact" class="flex flex-col gap-4" onsubmit={addContact}>
    <Field label="Entreprise"><Input bind:value={form.name} required maxlength={200} /></Field>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Domaine"><Input bind:value={form.domain} placeholder="exemple.fr" /></Field>
      <Field label="Ville"><Input bind:value={form.city} /></Field>
    </div>
    <Field label="Étape">
      <Select bind:value={form.stage}>
        {#each STAGES as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
      </Select>
    </Field>
    <p class="text-fc-xs font-semibold text-fc-fg-muted">Personne (facultatif)</p>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Prénom"><Input bind:value={form.firstName} /></Field>
      <Field label="Nom"><Input bind:value={form.lastName} /></Field>
      <Field label="E-mail"><Input type="email" bind:value={form.email} /></Field>
      <Field label="Fonction"><Input bind:value={form.role} /></Field>
    </div>
    <Field label="Notes"><Textarea bind:value={form.notes} rows={3} /></Field>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (addOpen = false)}>Annuler</Button>
    <Button type="submit" form="add-contact" disabled={saving}>
      {#if saving}<Spinner size="sm" />{/if}
      Ajouter
    </Button>
  {/snippet}
</Modal>
