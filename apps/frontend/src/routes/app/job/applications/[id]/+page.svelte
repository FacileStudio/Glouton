<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { QUIET } from '@repo/trpc-client';
  import {
    Badge,
    Button,
    Card,
    ConfirmModal,
    DatePicker,
    EmptyState,
    Field,
    Icon,
    Input,
    PageHeader,
    PlanLimit,
    Select,
    Spinner,
    Textarea,
    icons,
    planLimitFrom,
    toast,
    type PlanLimitError,
  } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { useLocale, useT } from '$lib/i18n';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { aiLanguage } from '$lib/components/competitors/ai';
  import { STATUS_ICON, STATUS_TONE, fromDay, isoDay, type Application, type ApplicationStatus, type Cv, type Draft } from '$lib/components/job/job';

  type Kind = 'CV' | 'LETTER';

  const t = useT();
  const locale = useLocale();
  const teamId = $derived(teamContextStore.getTeamId());
  const id = $derived(page.params.id ?? '');

  let app = $state<Application | null>(null);
  let drafts = $state<Draft[]>([]);
  let cvs = $state<Cv[]>([]);
  let cvId = $state('');
  let missing = $state(false);
  let saving = $state(false);
  let moving = $state(false);
  let drafting = $state<Kind | null>(null);
  let refused = $state<PlanLimitError | null>(null);
  let confirmDelete = $state(false);
  let edits = $state<Record<string, string>>({});
  let form = $state({
    notes: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    links: '',
    appliedAt: '',
    interviewAt: '',
    offerAt: '',
    rejectedAt: '',
    remindAt: '',
  });

  const usable = $derived(cvs.filter((entry) => entry.mine && entry.hasText));

  function fill(row: Application) {
    form = {
      notes: row.notes ?? '',
      contactName: row.contactName ?? '',
      contactEmail: row.contactEmail ?? '',
      contactPhone: row.contactPhone ?? '',
      links: row.links.join('\n'),
      appliedAt: isoDay(row.appliedAt),
      interviewAt: isoDay(row.interviewAt),
      offerAt: isoDay(row.offerAt),
      rejectedAt: isoDay(row.rejectedAt),
      remindAt: isoDay(row.remindAt),
    };
  }

  async function load() {
    try {
      const [row, ownDrafts, list] = await Promise.all([
        trpc.job.application.query({ teamId, applicationId: id }),
        trpc.job.drafts.query({ teamId, applicationId: id }),
        trpc.job.cvs.query({ teamId }),
      ]);
      app = row;
      drafts = ownDrafts;
      cvs = list;
      edits = Object.fromEntries(ownDrafts.map((entry) => [entry.id, entry.content]));
      if (!cvId) cvId = list.find((entry) => entry.mine && entry.hasText)?.id ?? '';
      fill(row);
    } catch {
      missing = true;
    }
  }

  onMount(load);

  async function move(status: ApplicationStatus) {
    if (!app) return;
    moving = true;
    try {
      await trpc.job.moveApplication.mutate({ teamId, applicationId: app.id, status });
      toast.success(t('job.applications.moved', { status: t(`job.status.${status}`) }));
      await load();
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      moving = false;
    }
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!app) return;
    saving = true;
    try {
      await trpc.job.updateApplication.mutate({
        teamId,
        applicationId: app.id,
        application: {
          notes: form.notes,
          contactName: form.contactName,
          contactEmail: form.contactEmail,
          contactPhone: form.contactPhone,
          links: form.links.split('\n').map((link) => link.trim()).filter(Boolean),
          appliedAt: fromDay(form.appliedAt),
          interviewAt: fromDay(form.interviewAt),
          offerAt: fromDay(form.offerAt),
          rejectedAt: fromDay(form.rejectedAt),
          remindAt: fromDay(form.remindAt, 8),
        },
      });
      toast.success(t('job.applications.saved'));
      await load();
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      saving = false;
    }
  }

  async function draft(kind: Kind) {
    if (!app) return;
    drafting = kind;
    refused = null;
    try {
      await trpc.job.draft.mutate({ teamId, applicationId: app.id, kind, cvId: cvId || undefined, language: aiLanguage(locale()) }, { context: QUIET });
      toast.success(t('job.drafts.ready'));
      await load();
    } catch (error) {
      refused = planLimitFrom((error as { data?: { plan_limit?: unknown } } | null)?.data?.plan_limit);
      if (refused) return;
      const message = getTrpcErrorMessage(error);
      toast.danger(message === 'cv_text_missing' ? t('job.drafts.needCv') : message);
    } finally {
      drafting = null;
    }
  }

  async function saveDraft(entry: Draft) {
    try {
      await trpc.job.updateDraft.mutate({ teamId, draftId: entry.id, content: edits[entry.id] ?? entry.content });
      toast.success(t('job.drafts.saved'));
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    }
  }

  async function copyDraft(entry: Draft) {
    await navigator.clipboard.writeText(edits[entry.id] ?? entry.content);
    toast.success(t('job.drafts.copied'));
  }

  async function removeDraft(entry: Draft) {
    await trpc.job.deleteDraft.mutate({ teamId, draftId: entry.id });
    await load();
  }

  async function remove() {
    if (!app) return;
    await trpc.job.deleteApplication.mutate({ teamId, applicationId: app.id });
    toast.success(t('job.applications.deleted'));
    await goto(resolve('/app/job/applications'));
  }
</script>

{#if missing}
  <EmptyState icon="solar:checklist-minimalistic-linear" title={t('job.applications.missing')}>
    <Button variant="secondary" href="/app/job/applications">{t('job.applications.back')}</Button>
  </EmptyState>
{:else if !app}
  <Card class="flex items-center justify-center py-16"><Spinner size="lg" /></Card>
{:else}
  <PageHeader title={app.title} description={[app.company, app.location].filter(Boolean).join(' · ')} back={{ href: resolve('/app/job/applications'), label: t('job.applications.back') }}>
    {#snippet actions()}
      {#if app?.url}<Button variant="secondary" icon="solar:square-top-down-linear" href={app.url} target="_blank" rel="noopener noreferrer external">{t('job.offers.view')}</Button>{/if}
      <Button variant="ghost" icon={icons.remove} onclick={() => (confirmDelete = true)}>{t('job.applications.delete')}</Button>
    {/snippet}
  </PageHeader>

  <div class="flex flex-col gap-6">
    <Card class="flex flex-col gap-4 p-5">
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-fc-sm text-fc-fg-muted">{t('job.applications.status')}</span>
        <Badge tone={STATUS_TONE[app.status]} class="shrink-0"><Icon icon={STATUS_ICON[app.status]} />{t(`job.status.${app.status}`)}</Badge>
      </div>
      <div class="flex flex-wrap gap-2">
        {#each app.next as status (status)}
          <Button size="sm" variant={status === 'REJECTED' ? 'ghost' : 'secondary'} icon={STATUS_ICON[status]} disabled={moving} onclick={() => move(status)}>
            {t(`job.move.${status}`)}
          </Button>
        {/each}
      </div>
    </Card>

    <Card class="flex flex-col gap-4 p-5">
      <h2 class="text-fc-md font-semibold text-fc-fg">{t('job.applications.follow')}</h2>
      <form id="application-form" class="flex flex-col gap-4" onsubmit={save}>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {#each ['appliedAt', 'interviewAt', 'offerAt', 'rejectedAt'] as const as field (field)}
            <Field label={t(`job.date.${field}`)} class="w-full">
              <DatePicker value={form[field]} locale={locale()} onChange={(value) => (form[field] = value)} />
            </Field>
          {/each}
        </div>
        <Field label={t('job.applications.notes')} for="app-notes" class="w-full">
          <Textarea id="app-notes" rows={4} maxlength={10000} class="field-sizing-content min-h-28 w-full" bind:value={form.notes} />
        </Field>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label={t('job.applications.contactName')} for="app-contact" class="w-full"><Input id="app-contact" bind:value={form.contactName} maxlength={200} /></Field>
          <Field label={t('job.applications.contactEmail')} for="app-email" class="w-full"><Input id="app-email" type="email" bind:value={form.contactEmail} maxlength={320} /></Field>
          <Field label={t('job.applications.contactPhone')} for="app-phone" class="w-full"><Input id="app-phone" type="tel" bind:value={form.contactPhone} maxlength={60} /></Field>
        </div>
        <Field label={t('job.applications.links')} helper={t('job.applications.linksHint')} for="app-links" class="w-full">
          <Textarea id="app-links" rows={2} class="field-sizing-content min-h-16 w-full" bind:value={form.links} />
        </Field>
        <Field label={t('job.applications.remind')} helper={t('job.applications.remindHint')} class="w-full sm:max-w-xs">
          <DatePicker value={form.remindAt} locale={locale()} onChange={(value) => (form.remindAt = value)} />
        </Field>
        <div><Button type="submit" icon={icons.check} disabled={saving}>{saving ? t('common.saving') : t('common.save')}</Button></div>
      </form>
    </Card>

    <Card class="flex flex-col gap-4 p-5">
      <div class="flex flex-col gap-1">
        <h2 class="text-fc-md font-semibold text-fc-fg">{t('job.drafts.title')}</h2>
        <p class="text-fc-xs text-fc-fg-muted">{t('job.drafts.text')}</p>
      </div>
      {#if usable.length === 0}
        <p class="text-fc-sm text-fc-fg-muted">{t('job.drafts.needCv')}</p>
        <div><Button variant="secondary" icon="solar:document-add-linear" href="/app/job/cv">{t('job.cv.add')}</Button></div>
      {:else}
        <div class="flex flex-wrap items-end gap-3">
          <Field label={t('job.drafts.fromCv')} for="draft-cv" class="w-full sm:w-72">
            <Select id="draft-cv" value={cvId} onchange={(e) => (cvId = e.currentTarget.value)}>
              {#each usable as entry (entry.id)}<option value={entry.id}>{entry.name}</option>{/each}
            </Select>
          </Field>
          <Button icon="solar:magic-stick-3-linear" disabled={drafting !== null} onclick={() => draft('LETTER')}>
            {drafting === 'LETTER' ? t('profile.ai.working') : t('job.drafts.letter')}
          </Button>
          <Button variant="secondary" icon="solar:magic-stick-3-linear" disabled={drafting !== null} onclick={() => draft('CV')}>
            {drafting === 'CV' ? t('profile.ai.working') : t('job.drafts.cv')}
          </Button>
        </div>
      {/if}
      <PlanLimit error={refused} />
      {#each drafts as entry (entry.id)}
        <div class="flex flex-col gap-2 rounded-fc-lg bg-fc-surface p-4">
          <div class="flex flex-wrap items-center gap-2">
            <Badge tone="accent" class="shrink-0">{entry.kind === 'LETTER' ? t('job.drafts.letterLabel') : t('job.drafts.cvLabel')}</Badge>
            <Badge class="shrink-0">{t('job.drafts.notSent')}</Badge>
          </div>
          <Textarea
            aria-label={entry.kind === 'LETTER' ? t('job.drafts.letterLabel') : t('job.drafts.cvLabel')}
            rows={10}
            class="field-sizing-content min-h-48 w-full"
            value={edits[entry.id] ?? entry.content}
            oninput={(e) => (edits = { ...edits, [entry.id]: e.currentTarget.value })}
          />
          <div class="flex flex-wrap gap-2">
            <Button size="sm" icon={icons.check} onclick={() => saveDraft(entry)}>{t('common.save')}</Button>
            <Button size="sm" variant="secondary" icon="solar:copy-linear" onclick={() => copyDraft(entry)}>{t('job.drafts.copy')}</Button>
            <Button size="sm" variant="ghost" icon={icons.remove} onclick={() => removeDraft(entry)}>{t('job.drafts.delete')}</Button>
          </div>
        </div>
      {/each}
    </Card>
  </div>

  <ConfirmModal
    bind:open={confirmDelete}
    title={t('job.applications.deleteTitle')}
    description={t('job.applications.deleteText')}
    confirmLabel={t('job.applications.delete')}
    cancelLabel={t('common.cancel')}
    tone="danger"
    onConfirm={remove}
  />
{/if}
