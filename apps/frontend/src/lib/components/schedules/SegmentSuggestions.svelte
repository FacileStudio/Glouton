<script lang="ts">
  import { QUIET } from '@repo/trpc-client';
  import type { RouterOutputs } from '@repo/trpc-client';
  import { Badge, Button, Section, Spinner, toast, type PlanLimitError } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { getErrorMessage } from '$lib/utils/trpc-error';
  import { useLocale, useT } from '$lib/i18n';
  import { categoryLabel, limitFrom } from './labels';

  type Segment = RouterOutputs['huntSchedule']['suggestSegments'][number];

  let {
    teamId,
    onAdded,
    onLimit,
  }: { teamId: string | undefined; onAdded: () => Promise<void>; onLimit: (refused: PlanLimitError) => void } = $props();

  const t = useT();
  const locale = useLocale();

  let segments = $state<Segment[] | null>(null);
  let suggesting = $state(false);
  let added = $state<string[]>([]);

  async function suggest() {
    suggesting = true;
    try {
      segments = await trpc.huntSchedule.suggestSegments.mutate({ teamId, language: locale() === 'en' ? 'en' : 'fr' });
      added = [];
    } catch (error) {
      const refused = limitFrom(error);
      if (refused) onLimit(refused);
      else toast.danger(getErrorMessage(error, t('schedules.actionFailed')));
    } finally {
      suggesting = false;
    }
  }

  async function addSegment(segment: Segment) {
    try {
      await trpc.huntSchedule.create.mutate(
        { teamId, frequency: 'WEEKLY', name: segment.name, location: segment.location, categories: segment.categories },
        { context: QUIET }
      );
      added = [...added, segment.name];
      toast.success(t('schedules.created'));
      await onAdded();
    } catch (error) {
      const refused = limitFrom(error);
      if (refused) onLimit(refused);
      else toast.danger(getErrorMessage(error, t('schedules.actionFailed')));
    }
  }
</script>

<Section title={t('schedules.ai.title')} card>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="max-w-prose text-fc-sm text-fc-fg-muted">{t('schedules.ai.text')}</p>
      <Button variant="secondary" icon={suggesting ? undefined : 'solar:magic-stick-3-linear'} onclick={suggest} disabled={suggesting}>
        {#if suggesting}
          <Spinner size="sm" label={t('schedules.ai.running')} />
          {t('schedules.ai.running')}
        {:else}
          {t('schedules.ai.run')}
        {/if}
      </Button>
    </div>
    {#if segments && segments.length === 0}
      <p class="text-fc-sm text-fc-fg-muted">{t('schedules.ai.none')}</p>
    {:else if segments}
      <ul class="flex flex-col gap-2">
        {#each segments as segment (segment.name)}
          <li class="flex flex-wrap items-center justify-between gap-3 rounded-fc-md bg-fc-component p-3">
            <div class="flex min-w-0 flex-col gap-1">
              <p class="font-medium text-fc-fg">{segment.name}</p>
              <p class="text-fc-sm text-fc-fg-muted">
                {segment.categories.map((c) => { const key = categoryLabel(c); return key ? t(key) : c; }).join(', ')} · {segment.location}
              </p>
              {#if segment.rationale}<p class="text-fc-xs text-fc-fg-muted">{segment.rationale}</p>{/if}
            </div>
            {#if added.includes(segment.name)}
              <Badge tone="success">{t('schedules.ai.added')}</Badge>
            {:else}
              <Button size="sm" icon="solar:refresh-circle-linear" onclick={() => addSegment(segment)}>{t('schedules.ai.add')}</Button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</Section>
