<script lang="ts">
  import { QUIET } from '@repo/trpc-client';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Button, Field, Icon, Input, PlanLimit, Select, SettingsRow, SettingsSection, Textarea, icons, toast, type PlanLimitError } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { useT } from '$lib/i18n';
  import { getErrorMessage } from '$lib/utils/trpc-error';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { CATEGORIES, FREQUENCIES, limitFrom, splitList, type BusinessCategory, type Frequency } from './labels';

  const t = useT();
  const teamId = $derived(teamContextStore.getTeamId());

  let offer = $state('');
  let area = $state('');
  let categories = $state<BusinessCategory[]>([]);
  let naf = $state('');
  let keywords = $state('');
  let saving = $state(false);
  let creating = $state(false);
  let frequency = $state<Frequency>('WEEKLY');
  let savedArea = $state('');
  let savedCategories = $state(0);
  let limit = $state<PlanLimitError | null>(null);

  function apply(profile: Awaited<ReturnType<typeof trpc.prospect.get.query>>) {
    offer = profile.offerDescription ?? '';
    area = profile.area ?? '';
    categories = [...profile.targetCategories];
    naf = profile.nafCodes.join(', ');
    keywords = profile.keywords.join(', ');
    savedArea = area;
    savedCategories = categories.length;
  }

  onMount(async () => {
    try {
      apply(await trpc.prospect.get.query({ teamId }));
    } catch (error) {
      toast.danger(getErrorMessage(error, t('prospect.saveFailed')));
    }
  });

  async function save() {
    saving = true;
    try {
      apply(
        await trpc.prospect.save.mutate({
          teamId,
          offerDescription: offer,
          area,
          targetCategories: categories,
          nafCodes: splitList(naf),
          keywords: splitList(keywords),
        })
      );
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
      await goto(resolve('/app/hunts/schedules'));
    } catch (error) {
      limit = limitFrom(error);
      if (!limit) toast.danger(getErrorMessage(error, t('schedules.actionFailed')));
    } finally {
      creating = false;
    }
  }
</script>

<SettingsSection title={t('prospect.title')} description={t('prospect.description')}>
  {#snippet actions()}
    <Button icon={icons.check} onclick={save} disabled={saving}>
      {saving ? t('common.saving') : t('common.save')}
    </Button>
  {/snippet}

  <SettingsRow stacked>
    <Field label={t('prospect.offer')} for="prospect-offer">
      <Textarea id="prospect-offer" rows={3} maxlength={4000} bind:value={offer} placeholder={t('prospect.offerPlaceholder')} />
    </Field>
  </SettingsRow>

  <SettingsRow stacked>
    <Field label={t('prospect.area')} for="prospect-area">
      <Input id="prospect-area" type="text" maxlength={200} bind:value={area} placeholder={t('prospect.areaPlaceholder')} />
    </Field>
  </SettingsRow>

  <SettingsRow stacked>
    <fieldset class="flex flex-col gap-3">
      <legend class="mb-3 text-fc-sm font-medium text-fc-fg">{t('prospect.categories')}</legend>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {#each CATEGORIES as category (category.value)}
          <label
            class="flex min-h-11 cursor-pointer items-center gap-2 rounded-fc-md p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-fc-ring {categories.includes(category.value)
              ? 'bg-fc-accent text-fc-accent-fg'
              : 'bg-fc-component hover:bg-fc-surface'}"
          >
            <input type="checkbox" value={category.value} bind:group={categories} class="size-4 shrink-0 accent-fc-accent" />
            <Icon icon={category.icon} class="text-fc-fg" />
            <span class="truncate text-fc-sm text-fc-fg">{t(category.label)}</span>
          </label>
        {/each}
      </div>
    </fieldset>
  </SettingsRow>

  <SettingsRow stacked>
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label={t('prospect.naf')} helper={t('prospect.nafHint')} for="prospect-naf">
        <Input id="prospect-naf" type="text" bind:value={naf} placeholder="56.10A, 62.01Z" />
      </Field>
      <Field label={t('prospect.keywords')} helper={t('prospect.keywordsHint')} for="prospect-keywords">
        <Input id="prospect-keywords" type="text" bind:value={keywords} />
      </Field>
    </div>
  </SettingsRow>
</SettingsSection>

<SettingsSection title={t('prospect.hunts.title')} description={t('prospect.hunts.text')}>
  <SettingsRow stacked>
    <PlanLimit error={limit} />
    {#if !savedArea || savedCategories === 0}
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
        <Button variant="ghost" href="/app/hunts/schedules">{t('schedules.open')}</Button>
      </div>
    {/if}
  </SettingsRow>
</SettingsSection>
