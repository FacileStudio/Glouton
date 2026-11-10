<script lang="ts">
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { Badge, Button, Card, ConfirmModal, Field, Input, PageHeader, Select, Spinner, toast } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import ContactActivity from '$lib/components/contacts/ContactActivity.svelte';
  import TurnIntoClientDialog from '$lib/components/contacts/TurnIntoClientDialog.svelte';
  import BullePanel from '$lib/components/bulle/BullePanel.svelte';
  import Composer from '$lib/components/mail/Composer.svelte';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import {
    STAGES,
    originLabel,
    personName,
    stageOf,
    temperatureOf,
    type Stage,
  } from '$lib/components/contacts/labels';
  import { useFormat, useT } from '$lib/i18n';

  const t = useT();
  const format = useFormat();
  type Company = Awaited<ReturnType<typeof trpc.contact.getCompany.query>>;

  const id = $derived(page.params.id ?? '');

  let company = $state<Company | null>(null);
  let loading = $state(true);
  let changingStage = $state(false);
  let addingPerson = $state(false);
  let personForm = $state({ firstName: '', lastName: '', email: '', role: '' });
  let showPersonForm = $state(false);
  let ardoise = $state<{ enabled: boolean; webUrl: string } | null>(null);
  let turnOpen = $state(false);
  let unlinkOpen = $state(false);
  let composerOpen = $state(false);
  let composerInitial = $state<{ subject: string; body: string } | null>(null);

  function compose(initial: { subject: string; body: string } | null = null) {
    composerInitial = initial;
    composerOpen = true;
  }

  function ardoiseLink(clientId: string): string | null {
    return ardoise ? `${ardoise.webUrl}/admin/clients/${encodeURIComponent(clientId)}` : null;
  }

  async function loadArdoise() {
    try {
      ardoise = await trpc.ardoise.status.query();
    } catch {
      ardoise = null;
    }
  }

  async function unlink() {
    if (!company) return;
    try {
      await trpc.ardoise.unlink.mutate({ companyId: company.id });
      toast.success(t('contacts.unlinked'));
      await load();
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    }
  }

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

  $effect(() => {
    void id;
    loading = true;
    load();
  });

  onMount(loadArdoise);
</script>

{#if loading && !company}
  <Card class="flex items-center justify-center py-16"><Spinner size="lg" /></Card>
{:else if !company}
  <p class="text-fc-sm text-fc-fg-muted">{t('contacts.companyNotFound')}</p>
{:else}
  {@const c = company}
  {@const st = stageOf(c.stage)}
  {@const temp = temperatureOf(c.temperature)}
  <PageHeader title={c.name} description={[c.domain, c.city, c.country].filter(Boolean).join(' · ')}>
    {#snippet actions()}
      <Button variant="secondary" href="/app/prospects/contacts" icon="solar:arrow-left-linear">{t('contacts.title')}</Button>
      <Button icon="solar:pen-new-square-linear" onclick={() => compose()}>{t('contacts.writeEmail')}</Button>
    {/snippet}
  </PageHeader>

  <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
    <div class="flex flex-col gap-4 lg:col-span-1">
      <Card class="flex flex-col gap-4 p-5">
        <div class="flex flex-wrap gap-1.5">
          <Badge tone={st.tone}>{t(st.label)}</Badge>
          {#if temp}<Badge tone={temp.tone}>{t(temp.label)} · {c.score}</Badge>{/if}
          <Badge>{originLabel(c.origin, t)}</Badge>
          {#if c.ardoiseClientId}
            {@const href = ardoiseLink(c.ardoiseClientId)}
            {#if href}
              <a {href} target="_blank" rel="external noopener noreferrer" class="rounded-fc-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring">
                <Badge tone="success">{t('contacts.linked')}</Badge>
              </a>
            {:else}
              <Badge tone="success">{t('contacts.linked')}</Badge>
            {/if}
          {/if}
        </div>
        {#if c.ardoiseClientId}
          <div class="flex flex-wrap gap-2">
            {#if ardoiseLink(c.ardoiseClientId)}
              <Button size="sm" variant="secondary" href={ardoiseLink(c.ardoiseClientId) ?? undefined} target="_blank" rel="noopener noreferrer" icon="solar:square-top-down-linear">{t('contacts.openArdoise')}</Button>
            {/if}
            <Button size="sm" variant="ghost" icon="solar:link-broken-linear" onclick={() => (unlinkOpen = true)}>{t('contacts.unlink')}</Button>
          </div>
        {:else if ardoise?.enabled}
          <Button size="sm" icon="solar:bill-list-linear" onclick={() => (turnOpen = true)}>{t('contacts.turnIntoClient')}</Button>
        {/if}
        <Field label={t('contacts.stage')}>
          <Select value={c.stage} disabled={changingStage} onchange={(e) => changeStage(e.currentTarget.value as Stage)}>
            {#each STAGES as s (s.value)}<option value={s.value}>{t(s.label)}</option>{/each}
          </Select>
        </Field>
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-fc-sm">
          {#if c.website || c.domain}
            <dt class="text-fc-fg-muted">{t('contacts.site')}</dt>
            <dd class="truncate"><a class="text-fc-fg underline" href={c.website ?? `https://${c.domain}`} target="_blank" rel="external noopener noreferrer">{c.website ?? c.domain}</a></dd>
          {/if}
          {#if c.emails.length}<dt class="text-fc-fg-muted">{t('contacts.emails')}</dt><dd class="break-all">{c.emails.join(', ')}</dd>{/if}
          {#if c.phones.length}<dt class="text-fc-fg-muted">{t('leads.stats.phones')}</dt><dd>{c.phones.join(', ')}</dd>{/if}
          {#if c.addressLine}<dt class="text-fc-fg-muted">{t('contacts.address')}</dt><dd>{[c.addressLine, c.postalCode, c.city].filter(Boolean).join(' ')}</dd>{/if}
          {#if c.siret}<dt class="text-fc-fg-muted">{t('contacts.siret')}</dt><dd>{c.siret}</dd>{/if}
          {#if c.category}<dt class="text-fc-fg-muted">{t('leads.filter.category')}</dt><dd>{c.category}</dd>{/if}
          <dt class="text-fc-fg-muted">{t('contacts.createdOn')}</dt><dd>{format.date(c.createdAt)}</dd>
        </dl>
        {#if c.legacyLeadId}
          <Button variant="ghost" size="sm" href="/app/leads/{c.legacyLeadId}" icon="solar:magnet-linear">{t('contacts.seeLead')}</Button>
        {/if}
        {#if c.notes}<p class="whitespace-pre-line text-fc-sm text-fc-fg">{c.notes}</p>{/if}
      </Card>

      <Card class="flex flex-col gap-4 p-5">
        <div class="flex items-center justify-between">
          <h2 class="text-fc-md font-semibold text-fc-fg">{t('contacts.people')}</h2>
          <Button size="sm" variant="ghost" icon="mdi:plus" onclick={() => (showPersonForm = !showPersonForm)}>{t('common.add')}</Button>
        </div>
        {#if showPersonForm}
          <form class="flex flex-col gap-3" onsubmit={addPerson}>
            <div class="grid grid-cols-2 gap-2">
              <Field label={t('contacts.firstName')}><Input bind:value={personForm.firstName} /></Field>
              <Field label={t('leads.detail.name')}><Input bind:value={personForm.lastName} /></Field>
            </div>
            <Field label={t('leads.sort.email')}><Input type="email" bind:value={personForm.email} /></Field>
            <Field label={t('contacts.role')}><Input bind:value={personForm.role} /></Field>
            <Button type="submit" size="sm" disabled={addingPerson}>{t('common.save')}</Button>
          </form>
        {/if}
        {#if c.people.length === 0}
          <p class="text-fc-sm text-fc-fg-muted">{t('contacts.noPeople')}</p>
        {:else}
          <ul class="flex flex-col gap-1">
            {#each c.people as p (p.id)}
              <li>
                <a href={resolve('/app/contacts/people/[id]', { id: p.id })} class="flex min-h-11 flex-col justify-center rounded-fc-md px-2 hover:bg-fc-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring">
                  <span class="text-fc-sm text-fc-fg">{personName(p, t)}{p.isBillingContact ? ` ${t('contacts.billingSuffix')}` : ''}</span>
                  <span class="text-fc-xs text-fc-fg-muted">{[p.role, p.email].filter(Boolean).join(' · ')}</span>
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </Card>
    </div>

    <div class="flex flex-col gap-4 lg:col-span-2">
      <Card class="p-5">
        <BullePanel task="next" context={{ teamId: teamContextStore.getTeamId(), companyId: c.id }} onUseDraft={compose} />
      </Card>
      <ContactActivity target={{ companyId: c.id }} activities={c.activities} suggestions={c.suggestions} onChange={load} />
      {#if c.outreach.length}
        <Card class="flex flex-col gap-3 p-5">
          <h2 class="text-fc-md font-semibold text-fc-fg">{t('contacts.emails')}</h2>
          <ul class="flex flex-col gap-2">
            {#each c.outreach as o (o.id)}
              <li class="flex flex-wrap items-center justify-between gap-2 text-fc-sm">
                <span class="min-w-0 truncate text-fc-fg">{o.subject}</span>
                <span class="flex items-center gap-2">
                  <Badge tone={o.status === 'DRAFT' ? 'warning' : o.status === 'FAILED' ? 'danger' : 'neutral'}>{o.status}</Badge>
                  <span class="text-fc-xs text-fc-fg-muted">{format.date(o.sentAt ?? o.createdAt)}</span>
                </span>
              </li>
            {/each}
          </ul>
        </Card>
      {/if}
    </div>
  </div>

  <Composer
    bind:open={composerOpen}
    people={c.people.map((p) => ({ ...p, companyName: c.name }))}
    companyId={c.id}
    initial={composerInitial}
    onDone={load}
  />
  <TurnIntoClientDialog bind:open={turnOpen} company={c} onDone={load} />
  <ConfirmModal
    bind:open={unlinkOpen}
    tone="danger"
    title={t('contacts.unlinkTitle')}
    description={t('contacts.unlinkText')}
    confirmLabel={t('contacts.unlink')}
    cancelLabel={t('common.cancel')}
    onConfirm={unlink}
  />
{/if}
