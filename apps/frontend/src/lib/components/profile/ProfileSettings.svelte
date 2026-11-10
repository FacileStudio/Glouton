<script lang="ts">
  import { QUIET } from '@repo/trpc-client';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Button, Field, PlanLimit, Select, SettingsRow, SettingsSection, icons, toast, type PlanLimitError } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { useT } from '$lib/i18n';
  import { getErrorMessage } from '$lib/utils/trpc-error';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { profileStore } from '$lib/stores/profile.svelte';
  import { FREQUENCIES, limitFrom, type Frequency } from '$lib/components/schedules/labels';
  import AboutFields from './AboutFields.svelte';
  import JobPicker from './JobPicker.svelte';
  import TargetPicker from './TargetPicker.svelte';
  import UsagePicker from './UsagePicker.svelte';
  import { activeTargets, formFrom, savePayload, type ProfileForm } from './form';

  const t = useT();
  const teamId = $derived(teamContextStore.getTeamId());

  let form = $state<ProfileForm>(formFrom(null));
  let saving = $state(false);
  let creating = $state(false);
  let frequency = $state<Frequency>('WEEKLY');
  let limit = $state<PlanLimitError | null>(null);

  const shown = $derived(activeTargets(form.usages));
  const saved = $derived(profileStore.value);
  const canHunt = $derived(Boolean(saved?.area) && (saved?.targets.clients.osmTags.length ?? 0) > 0);

  onMount(async () => {
    const profile = await profileStore.load(teamId);
    form = formFrom(profile);
  });

  async function save() {
    if (form.usages.length === 0) {
      toast.danger(t('profile.needUsage'));
      return;
    }
    saving = true;
    try {
      const profile = await trpc.prospect.save.mutate(savePayload(form, teamId));
      profileStore.set(profile);
      form = formFrom(profile);
      toast.success(t('prospect.saved'));
    } catch (error) {
      toast.danger(getErrorMessage(error, t('prospect.saveFailed')));
    } finally {
      saving = false;
    }
  }

  async function createHunts() {
    creating = true;
    try {
      const { created } = await trpc.huntSchedule.createFromProfile.mutate({ teamId, frequency }, { context: QUIET });
      if (created === 0) {
        toast.info(t('prospect.hunts.none'));
        return;
      }
      toast.success(t('prospect.hunts.created', { count: created }));
      await goto(resolve('/app/searches/schedules'));
    } catch (error) {
      limit = limitFrom(error);
      if (!limit) toast.danger(getErrorMessage(error, t('schedules.actionFailed')));
    } finally {
      creating = false;
    }
  }
</script>

{#snippet saveButton()}
  <Button icon={icons.check} onclick={save} disabled={saving}>
    {saving ? t('common.saving') : t('common.save')}
  </Button>
{/snippet}

<SettingsSection title={t('profile.usages.title')} description={t('profile.usages.description')} actions={saveButton}>
  <SettingsRow stacked>
    <UsagePicker bind:usages={form.usages} label={t('profile.usages.legend')} />
  </SettingsRow>
  <SettingsRow label={t('profile.wizard.title')} description={t('profile.wizard.text')}>
    <Button variant="secondary" icon="solar:play-circle-linear" href="/app/start">{t('profile.wizard.open')}</Button>
  </SettingsRow>
</SettingsSection>

<SettingsSection title={t('profile.about.title')} description={t('profile.about.description')}>
  <SettingsRow stacked>
    <AboutFields bind:form />
  </SettingsRow>
</SettingsSection>

{#each shown as usage (usage)}
  <SettingsSection title={t(`usage.${usage}.title`)} description={t(`usage.${usage}.target`)}>
    <SettingsRow stacked>
      <TargetPicker
        id="target-{usage}"
        {usage}
        bind:target={form.targets[usage]}
        offer={form.offer}
        area={form.area}
        {teamId}
        descriptionLabel={t(`usage.${usage}.who`)}
        descriptionExample={t(`usage.${usage}.whoExample`)}
        keywordExample={t(`usage.${usage}.keywordExample`)}
      />
    </SettingsRow>
    {#if usage === 'clients'}
      <SettingsRow stacked>
        <div class="flex w-full flex-col gap-3">
        <p class="text-fc-sm font-medium text-fc-fg">{t('prospect.hunts.title')}</p>
        <p class="text-fc-xs text-fc-fg-muted">{t('prospect.hunts.text')}</p>
        <PlanLimit error={limit} />
        {#if !canHunt}
          <p class="text-fc-sm text-fc-fg-muted">{t('prospect.hunts.needArea')}</p>
        {:else}
          <div class="flex flex-wrap items-end gap-3">
            <Field label={t('schedules.frequency')} for="prospect-frequency">
              <Select id="prospect-frequency" value={frequency} onchange={(e) => (frequency = e.currentTarget.value as Frequency)}>
                {#each FREQUENCIES as option (option)}
                  <option value={option}>{t(`schedules.freq.${option}`)}</option>
                {/each}
              </Select>
            </Field>
            <Button icon="solar:refresh-circle-linear" onclick={createHunts} disabled={creating}>{t('prospect.hunts.create')}</Button>
            <Button variant="ghost" href="/app/searches/schedules">{t('schedules.open')}</Button>
          </div>
        {/if}
        </div>
      </SettingsRow>
    {/if}
    {#if usage === 'competitors'}
      <SettingsRow label={t('discovery.find')} description={t('profile.competitorsHint')}>
        <Button variant="secondary" icon="solar:magnifer-linear" href="/app/competitors/suggestions">{t('discovery.openSuggestions')}</Button>
      </SettingsRow>
    {/if}
  </SettingsSection>
{/each}

{#if form.usages.includes('job')}
  <SettingsSection title={t('usage.job.title')} description={t('job.profile.target')}>
    <SettingsRow stacked>
      <JobPicker id="target-job" bind:job={form.job} {teamId} />
    </SettingsRow>
    <SettingsRow label={t('job.profile.findTitle')} description={t('job.profile.findText')}>
      <Button variant="secondary" icon="solar:magnifer-linear" href="/app/job/offers">{t('job.offers.open')}</Button>
    </SettingsRow>
  </SettingsSection>
{/if}
