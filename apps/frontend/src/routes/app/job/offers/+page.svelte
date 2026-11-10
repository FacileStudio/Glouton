<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { QUIET } from '@repo/trpc-client';
  import { Badge, Button, Card, Checkbox, EmptyState, Field, Icon, IconButton, Input, PageHeader, PlanLimit, Select, Spinner, Switch, icons, toast, type PlanLimitError } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { ws } from '$lib/websocket';
  import { useFormat, useT } from '$lib/i18n';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { profileStore } from '$lib/stores/profile.svelte';
  import { limitFrom } from '$lib/components/schedules/labels';
  import { JOB_CONTRACTS, type JobContract } from '$lib/components/profile/form';
  import { FREQUENCIES, salaryOf, type Frequency, type Offer, type Search } from '$lib/components/job/job';

  const t = useT();
  const format = useFormat();
  const teamId = $derived(teamContextStore.getTeamId());

  interface SearchForm {
    role: string;
    skills: string;
    location: string;
    remote: boolean;
    contracts: JobContract[];
    salaryMin: string;
    frequency: Frequency;
  }

  let searches = $state<Search[]>([]);
  let offers = $state<Offer[]>([]);
  let selected = $state<string | null>(null);
  let form = $state<SearchForm>({ role: '', skills: '', location: '', remote: false, contracts: [], salaryMin: '', frequency: '' });
  let loading = $state(true);
  let saving = $state(false);
  let busyOffer = $state<string | null>(null);
  let limit = $state<PlanLimitError | null>(null);

  const current = $derived(searches.find((entry) => entry.id === selected) ?? null);
  const running = $derived(current?.status === 'queued' || current?.status === 'running');

  function fill(search: Search | null) {
    if (search) {
      form = {
        role: search.role,
        skills: search.skills.join(', '),
        location: search.location ?? '',
        remote: search.remote,
        contracts: [...(search.contracts as JobContract[])],
        salaryMin: search.salaryMin ? String(search.salaryMin) : '',
        frequency: (search.frequency ?? '') as Frequency,
      };
      return;
    }
    const job = profileStore.value?.targets.job;
    form = {
      role: job?.role ?? '',
      skills: (job?.keywords ?? []).join(', '),
      location: job?.location ?? '',
      remote: job?.remote ?? false,
      contracts: [...((job?.contracts ?? []) as JobContract[])],
      salaryMin: job?.salaryMin ? String(job.salaryMin) : '',
      frequency: '',
    };
  }

  async function loadOffers() {
    offers = await trpc.job.offers.query({ teamId, searchId: selected ?? undefined });
  }

  async function load(keepSelection = true) {
    try {
      searches = await trpc.job.searches.query({ teamId });
      if (!keepSelection || !searches.some((entry) => entry.id === selected)) {
        selected = searches[0]?.id ?? null;
        fill(searches[0] ?? null);
      }
      await loadOffers();
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void (async () => {
      if (!profileStore.loaded) await profileStore.load(teamId);
      await load(false);
      await trpc.job.markOffersSeen.mutate({ teamId }, { context: QUIET }).catch(() => {});
    })();
    const off = ws.on('job-search:done', () => void load());
    const timer = setInterval(() => {
      if (running) void load();
    }, 3000);
    return () => {
      off();
      clearInterval(timer);
    };
  });

  function payload() {
    return {
      role: form.role.trim(),
      skills: form.skills.split(',').map((skill) => skill.trim()).filter(Boolean),
      location: form.location.trim() || null,
      remote: form.remote,
      contracts: form.contracts,
      salaryMin: form.salaryMin ? Math.max(0, Math.round(Number(form.salaryMin))) : null,
      frequency: form.frequency || null,
    };
  }

  async function search(event: SubmitEvent) {
    event.preventDefault();
    const fields = payload();
    if (!fields.role && fields.skills.length === 0) {
      toast.danger(t('job.search.needRole'));
      return;
    }
    saving = true;
    limit = null;
    try {
      if (current) {
        await trpc.job.updateSearch.mutate({ teamId, searchId: current.id, search: fields }, { context: QUIET });
        await trpc.job.runSearch.mutate({ teamId, searchId: current.id }, { context: QUIET });
      } else {
        const created = await trpc.job.createSearch.mutate({ teamId, search: fields, runNow: true }, { context: QUIET });
        selected = created.id;
      }
      toast.success(t('job.search.started'));
      await load();
    } catch (error) {
      limit = limitFrom(error);
      if (!limit) toast.danger(getTrpcErrorMessage(error));
    } finally {
      saving = false;
    }
  }

  function startNew() {
    selected = null;
    fill(null);
    offers = [];
  }

  async function pick(id: string) {
    selected = id;
    fill(searches.find((entry) => entry.id === id) ?? null);
    await loadOffers();
  }

  async function removeSearch() {
    if (!current) return;
    await trpc.job.deleteSearch.mutate({ teamId, searchId: current.id });
    toast.success(t('job.search.deleted'));
    await load(false);
  }

  async function save(offer: Offer) {
    busyOffer = offer.id;
    try {
      const { applicationId } = await trpc.job.saveOffer.mutate({ teamId, offerId: offer.id });
      offers = offers.filter((entry) => entry.id !== offer.id);
      toast.success(t('job.offers.saved'), {
        action: { label: t('job.offers.openApplication'), onClick: () => void goto(resolve('/app/job/applications/[id]', { id: applicationId })) },
      });
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      busyOffer = null;
    }
  }

  async function dismiss(offer: Offer) {
    busyOffer = offer.id;
    try {
      await trpc.job.dismissOffer.mutate({ teamId, offerId: offer.id });
      offers = offers.filter((entry) => entry.id !== offer.id);
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      busyOffer = null;
    }
  }

  function toggleContract(contract: JobContract, on: boolean) {
    form.contracts = on ? JOB_CONTRACTS.filter((entry) => entry === contract || form.contracts.includes(entry)) : form.contracts.filter((entry) => entry !== contract);
  }

  function runLine(entry: Search): string {
    if (entry.status === 'queued' || entry.status === 'running') return t('job.search.running');
    if (entry.status === 'failed') return t('job.search.failed');
    if (!entry.lastRunAt) return t('job.search.never');
    const created = entry.lastResult?.created ?? 0;
    return t('job.search.lastRun', { when: format.ago(entry.lastRunAt), count: created });
  }
</script>

<PageHeader title={t('job.offers.title')} description={t('job.offers.description')} />

{#if loading}
  <Card class="flex items-center justify-center py-16"><Spinner size="lg" /></Card>
{:else}
  <div class="flex flex-col gap-6">
    {#if searches.length > 0}
      <div class="flex flex-wrap items-center gap-2" role="list" aria-label={t('job.search.saved')}>
        {#each searches as entry (entry.id)}
          <div role="listitem">
            <Button variant={entry.id === selected ? 'primary' : 'secondary'} size="sm" icon={entry.frequency ? 'solar:refresh-circle-linear' : 'solar:magnifer-linear'} onclick={() => pick(entry.id)}>
              {entry.name}
            </Button>
          </div>
        {/each}
        <Button variant="ghost" size="sm" icon={icons.plus} onclick={startNew}>{t('job.search.new')}</Button>
      </div>
    {/if}

    <Card class="flex flex-col gap-5 p-5 sm:p-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-fc-md font-semibold text-fc-fg">{current ? current.name : t('job.search.title')}</h2>
        {#if current}
          <div class="flex flex-wrap items-center gap-2">
            {#if running}<Spinner size="sm" />{/if}
            <span class="text-fc-xs text-fc-fg-muted">{runLine(current)}</span>
            {#if current.lastResult?.quotaExhausted}<Badge tone="warning" class="shrink-0">{t('job.search.quota')}</Badge>{/if}
            <IconButton variant="ghost" aria-label={t('job.search.delete')} onclick={removeSearch}><Icon icon={icons.remove} /></IconButton>
          </div>
        {/if}
      </div>
      <form id="job-search" class="flex flex-col gap-4" onsubmit={search}>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t('job.profile.role')} for="search-role" class="w-full">
            <Input id="search-role" bind:value={form.role} maxlength={200} placeholder={t('job.profile.roleExample')} />
          </Field>
          <Field label={t('job.profile.skills')} helper={t('job.search.commaHint')} for="search-skills" class="w-full">
            <Input id="search-skills" bind:value={form.skills} maxlength={600} placeholder={t('job.profile.skillsExample')} />
          </Field>
          <Field label={t('job.profile.location')} for="search-location" class="w-full">
            <Input id="search-location" bind:value={form.location} maxlength={200} placeholder={t('job.profile.locationExample')} />
          </Field>
          <div class="flex items-end pb-1"><Switch label={t('job.profile.remote')} bind:checked={form.remote} /></div>
        </div>
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 text-fc-sm font-medium text-fc-fg">{t('job.profile.contracts')}</legend>
          <div class="flex flex-wrap gap-2">
            {#each JOB_CONTRACTS as contract (contract)}
              <div class="rounded-fc-pill px-3 py-1.5 {form.contracts.includes(contract) ? 'bg-fc-accent/25' : 'bg-fc-component'}">
                <Checkbox label={t(`job.contract.${contract}`)} checked={form.contracts.includes(contract)} onchange={(e) => toggleContract(contract, e.currentTarget.checked)} />
              </div>
            {/each}
          </div>
        </fieldset>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t('job.profile.salary')} helper={t('job.profile.salaryHint')} for="search-salary" class="w-full">
            <Input id="search-salary" type="number" inputmode="numeric" min={0} step={1000} bind:value={form.salaryMin} />
          </Field>
          <Field label={t('job.search.frequency')} helper={t('job.search.frequencyHint')} for="search-frequency" class="w-full">
            <Select id="search-frequency" value={form.frequency} onchange={(e) => (form.frequency = e.currentTarget.value as Frequency)}>
              {#each FREQUENCIES as option (option)}
                <option value={option}>{option ? t(`schedules.freq.${option}`) : t('job.search.manual')}</option>
              {/each}
            </Select>
          </Field>
        </div>
        <PlanLimit error={limit} />
        <div class="flex flex-wrap gap-2">
          <Button type="submit" icon="solar:magnifer-linear" disabled={saving || running}>{running ? t('job.search.running') : t('job.search.run')}</Button>
        </div>
        <p class="text-fc-xs text-fc-fg-muted">{t('job.search.sources')}</p>
      </form>
    </Card>

    {#if offers.length === 0}
      <EmptyState icon="solar:magnifer-linear" title={t('job.offers.empty')} description={running ? t('job.search.running') : t('job.offers.emptyText')} />
    {:else}
      <ul class="flex flex-col gap-3" aria-label={t('job.offers.title')}>
        {#each offers as offer (offer.id)}
          {@const salary = salaryOf(offer, (value) => format.number(value))}
          <li>
            <Card class="flex flex-col gap-3 p-4 sm:p-5">
              <div class="flex flex-col gap-1">
                <a href={offer.url} target="_blank" rel="noopener noreferrer external" class="text-fc-md font-semibold text-fc-fg hover:underline">{offer.title}</a>
                <p class="text-fc-sm text-fc-fg-muted">{[offer.company, offer.location].filter(Boolean).join(' · ')}</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <Badge tone={offer.score >= 60 ? 'success' : 'neutral'} class="shrink-0">{t('job.offers.match', { score: offer.score })}</Badge>
                {#if offer.remote}<Badge tone="info" class="shrink-0">{t('job.offers.remote')}</Badge>{/if}
                {#if offer.contract}<Badge class="shrink-0">{t(`job.contract.${offer.contract as JobContract}`)}</Badge>{/if}
                {#if salary}<Badge class="shrink-0">{salary}</Badge>{/if}
                <Badge class="shrink-0">{offer.source === 'web' ? t('job.offers.web') : offer.source}</Badge>
              </div>
              {#if offer.description}<p class="line-clamp-3 text-fc-sm text-fc-fg-muted">{offer.description}</p>{/if}
              <div class="flex flex-wrap gap-2">
                <Button size="sm" icon="solar:bookmark-linear" disabled={busyOffer === offer.id} onclick={() => save(offer)}>{t('job.offers.save')}</Button>
                <Button size="sm" variant="ghost" icon={icons.close} disabled={busyOffer === offer.id} onclick={() => dismiss(offer)}>{t('job.offers.dismiss')}</Button>
                <Button size="sm" variant="ghost" icon="solar:square-top-down-linear" href={offer.url} target="_blank" rel="noopener noreferrer external">{t('job.offers.view')}</Button>
              </div>
            </Card>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
