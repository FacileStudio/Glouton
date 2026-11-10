<script lang="ts">
  import { Button, Combobox, Field, Icon, IconButton, Input, PlanLimit, Textarea, icons, planLimitFrom, toast, type PlanLimitError } from '@facile/muse';
  import { QUIET } from '@repo/trpc-client';
  import { searchTaxonomy } from '@repo/trpc/taxonomy';
  import { trpc } from '$lib/trpc';
  import { useLocale, useT } from '$lib/i18n';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { aiLanguage } from '$lib/components/competitors/ai';
  import { addSuggestion, chipLabel, emptySuggestion, hasSuggestion, removeChip, type Suggestion, type Target, type TargetList } from './targets';

  interface Props {
    id: string;
    usage: 'clients' | 'competitors' | 'missions' | 'partners';
    target: Target;
    offer: string;
    area: string;
    teamId?: string;
    descriptionLabel: string;
    descriptionExample: string;
    keywordExample: string;
  }

  let { id, usage, target = $bindable(), offer, area, teamId, descriptionLabel, descriptionExample, keywordExample }: Props = $props();

  const t = useT();
  const locale = useLocale();

  let query = $state('');
  let keyword = $state('');
  let suggesting = $state(false);
  let suggestion = $state<Suggestion>(emptySuggestion());
  let refused = $state<PlanLimitError | null>(null);

  const options = $derived(
    searchTaxonomy(query, locale(), { limit: 30 }).map((item) => ({
      value: `${item.kind}:${item.value}`,
      label: item.kind === 'naf' ? `${item.value} · ${item.label}` : `${item.label} · ${item.value}`,
    })),
  );

  const chips = $derived([
    ...target.nafCodes.map((value) => ({ list: 'nafCodes' as const, value })),
    ...target.osmTags.map((value) => ({ list: 'osmTags' as const, value })),
    ...target.keywords.map((value) => ({ list: 'keywords' as const, value })),
  ]);

  function pick(option: { value: string }) {
    const [kind, ...rest] = option.value.split(':');
    const value = rest.join(':');
    const list: TargetList = kind === 'naf' ? 'nafCodes' : 'osmTags';
    if (!target[list].includes(value)) target = { ...target, [list]: [...target[list], value] };
    query = '';
  }

  function addKeyword(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ',') return;
    event.preventDefault();
    const value = keyword.trim().toLowerCase();
    if (value && !target.keywords.includes(value)) target = { ...target, keywords: [...target.keywords, value] };
    keyword = '';
  }

  async function suggest() {
    suggesting = true;
    refused = null;
    try {
      const found = await trpc.prospect.suggestTargets.mutate(
        { teamId, usage, language: aiLanguage(locale()), offer: offer.trim() || undefined, description: target.description?.trim() || undefined, area: area.trim() || undefined },
        { context: QUIET },
      );
      suggestion = {
        nafCodes: found.nafCodes.filter((value) => !target.nafCodes.includes(value)),
        osmTags: found.osmTags.filter((value) => !target.osmTags.includes(value)),
        keywords: found.keywords.filter((value) => !target.keywords.includes(value)),
      };
      if (!hasSuggestion(suggestion)) toast.info(t('profile.ai.nothing'));
    } catch (error) {
      refused = planLimitFrom((error as { data?: { plan_limit?: unknown } } | null)?.data?.plan_limit);
      if (!refused) toast.danger(getTrpcErrorMessage(error));
    } finally {
      suggesting = false;
    }
  }

  function accept(list: TargetList, value: string) {
    target = addSuggestion(target, list, value);
    suggestion = { ...suggestion, [list]: suggestion[list].filter((entry) => entry !== value) };
  }

  function discard(list: TargetList, value: string) {
    suggestion = { ...suggestion, [list]: suggestion[list].filter((entry) => entry !== value) };
  }

  const pending = $derived([
    ...suggestion.nafCodes.map((value) => ({ list: 'nafCodes' as const, value })),
    ...suggestion.osmTags.map((value) => ({ list: 'osmTags' as const, value })),
    ...suggestion.keywords.map((value) => ({ list: 'keywords' as const, value })),
  ]);
</script>

<div class="flex w-full min-w-0 flex-col gap-4">
  <Field label={descriptionLabel} helper={t('profile.example', { example: descriptionExample })} for="{id}-description" class="w-full">
    <Textarea
      id="{id}-description"
      rows={3}
      maxlength={2000}
      class="field-sizing-content min-h-24 w-full"
      value={target.description ?? ''}
      oninput={(e) => (target = { ...target, description: e.currentTarget.value })}
      placeholder={descriptionExample}
    />
  </Field>

  <Field label={t('profile.taxonomy')} helper={t('profile.taxonomyHint')} for="{id}-taxonomy" class="w-full">
    <Combobox
      id="{id}-taxonomy"
      bind:value={query}
      {options}
      onSelect={pick}
      placeholder={t('profile.taxonomyPlaceholder')}
      emptyLabel={t('profile.taxonomyEmpty')}
      wrapperClass="w-full"
    />
  </Field>

  <Field label={t('profile.keywords')} helper={t('profile.example', { example: keywordExample })} for="{id}-keywords" class="w-full">
    <Input id="{id}-keywords" type="text" maxlength={60} bind:value={keyword} onkeydown={addKeyword} placeholder={keywordExample} />
  </Field>

  {#if chips.length > 0}
    <ul class="flex flex-wrap gap-2" aria-label={t('profile.selected')}>
      {#each chips as chip (`${chip.list}:${chip.value}`)}
        <li class="inline-flex max-w-full items-center gap-1 rounded-fc-pill bg-fc-component py-0.5 pr-0.5 pl-3 text-fc-xs whitespace-nowrap text-fc-fg">
          <span class="truncate">{chipLabel(chip.list, chip.value, locale())}</span>
          <IconButton
            variant="ghost"
            class="size-8"
            aria-label={t('profile.remove', { name: chipLabel(chip.list, chip.value, locale()) })}
            onclick={() => (target = removeChip(target, chip.list, chip.value))}
          >
            <Icon icon={icons.close} />
          </IconButton>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="flex flex-col gap-3">
    <div>
      <Button variant="secondary" icon="solar:magic-stick-3-linear" onclick={suggest} disabled={suggesting || (!offer.trim() && !target.description?.trim())}>
        {suggesting ? t('profile.ai.working') : t('profile.ai.suggest')}
      </Button>
    </div>
    <PlanLimit error={refused} />
    {#if pending.length > 0}
      <div class="flex flex-col gap-2 rounded-fc-lg bg-fc-surface p-3">
        <p class="text-fc-xs text-fc-fg-muted">{t('profile.ai.review')}</p>
        <ul class="flex flex-wrap gap-2">
          {#each pending as chip (`${chip.list}:${chip.value}`)}
            <li class="inline-flex max-w-full items-center gap-0.5 rounded-fc-pill bg-fc-component py-0.5 pr-0.5 pl-3 text-fc-xs whitespace-nowrap text-fc-fg">
              <span class="truncate">{chipLabel(chip.list, chip.value, locale())}</span>
              <IconButton variant="ghost" class="size-8" aria-label={t('profile.ai.accept', { name: chipLabel(chip.list, chip.value, locale()) })} onclick={() => accept(chip.list, chip.value)}>
                <Icon icon={icons.check} />
              </IconButton>
              <IconButton variant="ghost" class="size-8" aria-label={t('profile.ai.discard', { name: chipLabel(chip.list, chip.value, locale()) })} onclick={() => discard(chip.list, chip.value)}>
                <Icon icon={icons.close} />
              </IconButton>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
</div>
