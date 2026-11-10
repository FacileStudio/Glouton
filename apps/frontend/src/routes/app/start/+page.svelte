<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Button, Card, PageHeader, Progress, Spinner, icons, toast } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { useT } from '$lib/i18n';
  import { getErrorMessage } from '$lib/utils/trpc-error';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { profileStore } from '$lib/stores/profile.svelte';
  import { homeFor } from '$lib/usage/nav';
  import AboutFields from '$lib/components/profile/AboutFields.svelte';
  import JobPicker from '$lib/components/profile/JobPicker.svelte';
  import TargetPicker from '$lib/components/profile/TargetPicker.svelte';
  import UsagePicker from '$lib/components/profile/UsagePicker.svelte';
  import { activeTargets, formFrom, hasBusiness, savePayload, type BusinessUsage, type ProfileForm } from '$lib/components/profile/form';

  type JobPart = 'role' | 'place' | 'contract';
  type Step =
    | { kind: 'usages' }
    | { kind: 'about'; field: 'offer' | 'website' | 'area' }
    | { kind: 'target'; usage: BusinessUsage }
    | { kind: 'job'; part: JobPart };

  const JOB_PARTS: readonly JobPart[] = ['role', 'place', 'contract'];

  const t = useT();
  const teamId = $derived(teamContextStore.getTeamId());

  let form = $state<ProfileForm>(formFrom(null));
  let ready = $state(false);
  let index = $state(0);
  let saving = $state(false);

  const steps = $derived<Step[]>([
    { kind: 'usages' },
    ...(hasBusiness(form.usages)
      ? [{ kind: 'about' as const, field: 'offer' as const }, { kind: 'about' as const, field: 'website' as const }, { kind: 'about' as const, field: 'area' as const }]
      : []),
    ...activeTargets(form.usages).map((usage) => ({ kind: 'target' as const, usage })),
    ...(form.usages.includes('job') ? JOB_PARTS.map((part) => ({ kind: 'job' as const, part })) : []),
  ]);
  const step = $derived(steps[Math.min(index, steps.length - 1)]!);
  const last = $derived(index >= steps.length - 1);

  onMount(async () => {
    const profile = await profileStore.load(teamId);
    form = formFrom(profile);
    if (!profile?.onboarded) form.usages = [];
    ready = true;
  });

  function next() {
    if (step.kind === 'usages' && form.usages.length === 0) {
      toast.danger(t('profile.needUsage'));
      return;
    }
    if (last) void finish(form);
    else index += 1;
  }

  async function finish(values: ProfileForm) {
    saving = true;
    try {
      const profile = await trpc.prospect.save.mutate(savePayload(values, teamId));
      profileStore.set(profile);
      toast.success(t('start.done'));
      await goto(resolve(homeFor(profileStore.usages()) as '/app'));
    } catch (error) {
      toast.danger(getErrorMessage(error, t('prospect.saveFailed')));
    } finally {
      saving = false;
    }
  }

  function skip() {
    void finish({ ...form, usages: form.usages.length > 0 ? form.usages : ['clients', 'competitors'] });
  }

  function title(current: Step): string {
    if (current.kind === 'usages') return t('start.q.usages');
    if (current.kind === 'about') return t(`start.q.${current.field}`);
    if (current.kind === 'job') return t(`start.q.job.${current.part}`);
    return t(`usage.${current.usage}.who`);
  }
</script>

<PageHeader title={t('start.title')} description={t('start.description')} />

{#if !ready}
  <Card class="flex items-center justify-center py-16"><Spinner size="lg" /></Card>
{:else}
  <Card class="flex flex-col gap-6 p-5 sm:p-8">
    <div class="flex flex-col gap-2">
      <Progress value={index + 1} max={steps.length} label={t('start.progress', { step: index + 1, total: steps.length })} />
      <p class="text-fc-xs text-fc-fg-muted">{t('start.progress', { step: index + 1, total: steps.length })}</p>
    </div>
    <h2 class="text-fc-lg font-semibold text-fc-fg">{title(step)}</h2>

    {#if step.kind === 'usages'}
      <UsagePicker bind:usages={form.usages} label={t('start.usagesLegend')} />
    {:else if step.kind === 'about'}
      <AboutFields bind:form show={[step.field]} />
    {:else if step.kind === 'job'}
      {#key step.part}
        <JobPicker id="start-job-{step.part}" bind:job={form.job} {teamId} show={[step.part]} />
      {/key}
    {:else}
      {#key step.usage}
        <TargetPicker
          id="start-{step.usage}"
          usage={step.usage}
          bind:target={form.targets[step.usage]}
          offer={form.offer}
          area={form.area}
          {teamId}
          descriptionLabel={t(`usage.${step.usage}.whoLabel`)}
          descriptionExample={t(`usage.${step.usage}.whoExample`)}
          keywordExample={t(`usage.${step.usage}.keywordExample`)}
        />
      {/key}
    {/if}

    <div class="flex flex-wrap items-center justify-between gap-3">
      <Button variant="ghost" onclick={skip} disabled={saving}>{t('start.skip')}</Button>
      <div class="flex flex-wrap gap-2">
        {#if index > 0}<Button variant="secondary" icon={icons.chevronLeft} onclick={() => (index -= 1)} disabled={saving}>{t('start.back')}</Button>{/if}
        <Button iconRight={last ? icons.check : icons.arrow} onclick={next} disabled={saving}>{last ? t('start.finish') : t('start.next')}</Button>
      </div>
    </div>
  </Card>
{/if}
