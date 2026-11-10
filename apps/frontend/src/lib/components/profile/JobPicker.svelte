<script lang="ts">
  import { Button, Checkbox, Field, Icon, IconButton, Input, PlanLimit, Switch, Textarea, icons, planLimitFrom, toast, type PlanLimitError } from '@facile/muse';
  import { QUIET } from '@repo/trpc-client';
  import { trpc } from '$lib/trpc';
  import { useLocale, useT } from '$lib/i18n';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { aiLanguage } from '$lib/components/competitors/ai';
  import { JOB_CONTRACTS, type JobContract, type JobTarget } from './form';

  type Part = 'role' | 'place' | 'contract';

  interface Props {
    id: string;
    job: JobTarget;
    teamId?: string;
    show?: Part[];
  }

  let { id, job = $bindable(), teamId, show = ['role', 'place', 'contract'] }: Props = $props();

  const t = useT();
  const locale = useLocale();

  let skill = $state('');
  let suggesting = $state(false);
  let suggested = $state<string[]>([]);
  let refused = $state<PlanLimitError | null>(null);

  function addSkill(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ',') return;
    event.preventDefault();
    const value = skill.trim().toLowerCase();
    if (value && !job.keywords.includes(value)) job = { ...job, keywords: [...job.keywords, value] };
    skill = '';
  }

  function removeSkill(value: string) {
    job = { ...job, keywords: job.keywords.filter((entry) => entry !== value) };
  }

  function toggleContract(contract: JobContract, on: boolean) {
    const contracts = on ? JOB_CONTRACTS.filter((entry) => entry === contract || job.contracts.includes(entry)) : job.contracts.filter((entry) => entry !== contract);
    job = { ...job, contracts };
  }

  async function suggest() {
    suggesting = true;
    refused = null;
    try {
      const found = await trpc.prospect.suggestTargets.mutate(
        { teamId, usage: 'job', language: aiLanguage(locale()), description: [job.role, job.description].filter(Boolean).join('. ') || undefined },
        { context: QUIET },
      );
      suggested = found.keywords.filter((value) => !job.keywords.includes(value));
      if (suggested.length === 0) toast.info(t('profile.ai.nothing'));
    } catch (error) {
      refused = planLimitFrom((error as { data?: { plan_limit?: unknown } } | null)?.data?.plan_limit);
      if (!refused) toast.danger(getTrpcErrorMessage(error));
    } finally {
      suggesting = false;
    }
  }

  function accept(value: string) {
    if (!job.keywords.includes(value)) job = { ...job, keywords: [...job.keywords, value] };
    suggested = suggested.filter((entry) => entry !== value);
  }
</script>

<div class="flex w-full min-w-0 flex-col gap-4">
  {#if show.includes('role')}
    <Field label={t('job.profile.role')} helper={t('profile.example', { example: t('job.profile.roleExample') })} for="{id}-role" class="w-full">
      <Input id="{id}-role" type="text" maxlength={200} value={job.role} oninput={(e) => (job = { ...job, role: e.currentTarget.value })} placeholder={t('job.profile.roleExample')} />
    </Field>
    <Field label={t('job.profile.about')} helper={t('job.profile.aboutHint')} for="{id}-about" class="w-full">
      <Textarea
        id="{id}-about"
        rows={3}
        maxlength={2000}
        class="field-sizing-content min-h-24 w-full"
        value={job.description ?? ''}
        oninput={(e) => (job = { ...job, description: e.currentTarget.value })}
      />
    </Field>
    <Field label={t('job.profile.skills')} helper={t('profile.example', { example: t('job.profile.skillsExample') })} for="{id}-skills" class="w-full">
      <Input id="{id}-skills" type="text" maxlength={60} bind:value={skill} onkeydown={addSkill} placeholder={t('job.profile.skillsExample')} />
    </Field>
    {#if job.keywords.length > 0}
      <ul class="flex flex-wrap gap-2" aria-label={t('job.profile.skills')}>
        {#each job.keywords as value (value)}
          <li class="inline-flex max-w-full items-center gap-1 rounded-fc-pill bg-fc-component py-0.5 pr-0.5 pl-3 text-fc-xs whitespace-nowrap text-fc-fg">
            <span class="truncate">{value}</span>
            <IconButton variant="ghost" class="size-8" aria-label={t('profile.remove', { name: value })} onclick={() => removeSkill(value)}>
              <Icon icon={icons.close} />
            </IconButton>
          </li>
        {/each}
      </ul>
    {/if}
    <div class="flex flex-col gap-3">
      <div>
        <Button variant="secondary" icon="solar:magic-stick-3-linear" onclick={suggest} disabled={suggesting || (!job.role.trim() && !job.description?.trim())}>
          {suggesting ? t('profile.ai.working') : t('job.profile.suggestSkills')}
        </Button>
      </div>
      <PlanLimit error={refused} />
      {#if suggested.length > 0}
        <div class="flex flex-col gap-2 rounded-fc-lg bg-fc-surface p-3">
          <p class="text-fc-xs text-fc-fg-muted">{t('profile.ai.review')}</p>
          <ul class="flex flex-wrap gap-2">
            {#each suggested as value (value)}
              <li class="inline-flex max-w-full items-center gap-0.5 rounded-fc-pill bg-fc-component py-0.5 pr-0.5 pl-3 text-fc-xs whitespace-nowrap text-fc-fg">
                <span class="truncate">{value}</span>
                <IconButton variant="ghost" class="size-8" aria-label={t('profile.ai.accept', { name: value })} onclick={() => accept(value)}>
                  <Icon icon={icons.check} />
                </IconButton>
                <IconButton variant="ghost" class="size-8" aria-label={t('profile.ai.discard', { name: value })} onclick={() => (suggested = suggested.filter((entry) => entry !== value))}>
                  <Icon icon={icons.close} />
                </IconButton>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  {/if}

  {#if show.includes('place')}
    <div class="grid w-full grid-cols-1 items-end gap-4 md:grid-cols-[1fr_auto]">
      <Field label={t('job.profile.location')} helper={t('profile.example', { example: t('job.profile.locationExample') })} for="{id}-location" class="w-full">
        <Input id="{id}-location" type="text" maxlength={200} value={job.location} oninput={(e) => (job = { ...job, location: e.currentTarget.value })} placeholder={t('job.profile.locationExample')} />
      </Field>
      <div class="pb-6"><Switch label={t('job.profile.remote')} checked={job.remote} onchange={(e) => (job = { ...job, remote: e.currentTarget.checked })} /></div>
    </div>
  {/if}

  {#if show.includes('contract')}
    <fieldset class="flex w-full flex-col gap-3">
      <legend class="mb-2 text-fc-sm font-medium text-fc-fg">{t('job.profile.contracts')}</legend>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {#each JOB_CONTRACTS as contract (contract)}
          <div class="rounded-fc-lg p-3 {job.contracts.includes(contract) ? 'bg-fc-accent/25' : 'bg-fc-component'}">
            <Checkbox label={t(`job.contract.${contract}`)} checked={job.contracts.includes(contract)} onchange={(e) => toggleContract(contract, e.currentTarget.checked)} />
          </div>
        {/each}
      </div>
      <p class="text-fc-xs text-fc-fg-muted">{t('job.profile.contractsHint')}</p>
    </fieldset>
    <Field label={t('job.profile.salary')} helper={t('job.profile.salaryHint')} for="{id}-salary" class="w-full sm:max-w-xs">
      <Input
        id="{id}-salary"
        type="number"
        inputmode="numeric"
        min={0}
        step={1000}
        value={job.salaryMin ?? ''}
        oninput={(e) => (job = { ...job, salaryMin: e.currentTarget.value ? Number(e.currentTarget.value) : null })}
      />
    </Field>
  {/if}
</div>
