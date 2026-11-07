<script lang="ts">
  import { page } from '$app/state';
  import { Badge, Button, Card, Field, PageHeader, Select, Spinner, toast } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import ContactActivity from '$lib/components/contacts/ContactActivity.svelte';
  import Composer from '$lib/components/mail/Composer.svelte';
  import { STAGES, originLabel, personName, stageOf, type Stage } from '$lib/components/contacts/labels';
  import { useFormat, useT } from '$lib/i18n';

  const t = useT();
  const format = useFormat();
  type Person = Awaited<ReturnType<typeof trpc.contact.getPerson.query>>;

  const id = $derived(page.params.id ?? '');

  let person = $state<Person | null>(null);
  let loading = $state(true);
  let changingStage = $state(false);
  let composerOpen = $state(false);

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

  $effect(() => {
    void id;
    loading = true;
    load();
  });
</script>

{#if loading && !person}
  <Card class="flex items-center justify-center py-16"><Spinner size="lg" /></Card>
{:else if !person}
  <p class="text-fc-sm text-fc-fg-muted">{t('contacts.personNotFound')}</p>
{:else}
  {@const p = person}
  {@const st = stageOf(p.stage)}
  <PageHeader title={personName(p, t)} description={[p.role, p.company?.name].filter(Boolean).join(' · ')}>
    {#snippet actions()}
      {#if p.company}
        <Button variant="secondary" href="/app/contacts/companies/{p.company.id}" icon="solar:buildings-2-linear">{p.company.name}</Button>
      {:else}
        <Button variant="secondary" href="/app/contacts" icon="solar:arrow-left-linear">{t('contacts.title')}</Button>
      {/if}
      <Button icon="solar:pen-new-square-linear" onclick={() => (composerOpen = true)}>{t('contacts.writeEmail')}</Button>
    {/snippet}
  </PageHeader>

  <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
    <Card class="flex flex-col gap-4 p-5 lg:col-span-1">
      <div class="flex flex-wrap gap-1.5">
        <Badge tone={st.tone}>{t(st.label)}</Badge>
        <Badge>{originLabel(p.origin, t)}</Badge>
        {#if p.emailVerified === true}<Badge tone="success">{t('contacts.emailVerified')}</Badge>{/if}
        {#if p.emailVerified === false}<Badge tone="danger">{t('contacts.emailInvalid')}</Badge>{/if}
      </div>
      <Field label={t('contacts.stage')}>
        <Select value={p.stage} disabled={changingStage} onchange={(e) => changeStage(e.currentTarget.value as Stage)}>
          {#each STAGES as s (s.value)}<option value={s.value}>{t(s.label)}</option>{/each}
        </Select>
      </Field>
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-fc-sm">
        {#if p.email}<dt class="text-fc-fg-muted">{t('leads.sort.email')}</dt><dd class="break-all">{p.email}</dd>{/if}
        {#if p.emails.length}<dt class="text-fc-fg-muted">{t('leads.map.others')}</dt><dd class="break-all">{p.emails.join(', ')}</dd>{/if}
        {#if p.phones.length}<dt class="text-fc-fg-muted">{t('leads.stats.phones')}</dt><dd>{p.phones.join(', ')}</dd>{/if}
        <dt class="text-fc-fg-muted">{t('contacts.createdOn')}</dt><dd>{format.date(p.createdAt)}</dd>
      </dl>
      {#if p.notes}<p class="whitespace-pre-line text-fc-sm text-fc-fg">{p.notes}</p>{/if}
    </Card>

    <div class="flex flex-col gap-4 lg:col-span-2">
      <ContactActivity target={{ personId: p.id }} activities={p.activities} suggestions={p.suggestions} onChange={load} />
      {#if p.outreach.length}
        <Card class="flex flex-col gap-3 p-5">
          <h2 class="text-fc-md font-semibold text-fc-fg">{t('contacts.emails')}</h2>
          <ul class="flex flex-col gap-2">
            {#each p.outreach as o (o.id)}
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

  <Composer bind:open={composerOpen} person={{ ...p, companyName: p.company?.name }} companyId={p.company?.id} onDone={load} />
{/if}
