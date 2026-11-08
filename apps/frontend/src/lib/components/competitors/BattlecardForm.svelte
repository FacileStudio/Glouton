<script lang="ts">
  import { Button, Card, Field, Input, Select, Spinner, Textarea, toast } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { useT } from '$lib/i18n';
  import ListEditor from './ListEditor.svelte';
  import ObjectionsEditor from './ObjectionsEditor.svelte';
  import { LIST_SECTIONS, splitList, type CompetitorCard, type Objection } from './labels';

  interface Props {
    card: CompetitorCard;
    onCancel: () => void;
    onSaved: () => void;
  }

  let { card, onCancel, onSaved }: Props = $props();
  const t = useT();

  type Draft = {
    name: string;
    website: string;
    area: string;
    nafCodes: string;
    tags: string;
    notes: string;
    status: 'ACTIVE' | 'ARCHIVED';
    overview: string;
    pricing: string;
    whyWeWin: string[];
    whyWeLose: string[];
    landmines: string[];
    proofPoints: string[];
    objections: Objection[];
  };

  function fromCard(): Draft {
    return {
      name: card.name,
      website: card.website ?? '',
      area: card.area ?? '',
      nafCodes: card.nafCodes.join(', '),
      tags: card.tags.join(', '),
      notes: card.notes ?? '',
      status: card.status,
      overview: card.overview ?? '',
      pricing: card.pricing ?? '',
      whyWeWin: [...card.whyWeWin],
      whyWeLose: [...card.whyWeLose],
      landmines: [...card.landmines],
      proofPoints: [...card.proofPoints],
      objections: card.objections.map((o) => ({ ...o })),
    };
  }

  const filled = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!draft.name.trim()) {
      toast.danger(t('competitors.nameRequired'));
      return;
    }
    saving = true;
    try {
      await trpc.competitor.update.mutate({
        competitorId: card.id,
        name: draft.name,
        website: draft.website || null,
        area: draft.area || null,
        nafCodes: splitList(draft.nafCodes),
        tags: splitList(draft.tags),
        notes: draft.notes || null,
        status: draft.status,
        overview: draft.overview || null,
        pricing: draft.pricing || null,
        whyWeWin: filled(draft.whyWeWin),
        whyWeLose: filled(draft.whyWeLose),
        landmines: filled(draft.landmines),
        proofPoints: filled(draft.proofPoints),
        objections: draft.objections.filter((o) => o.objection.trim()),
      });
      toast.success(t('competitors.saved'));
      onSaved();
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      saving = false;
    }
  }

  const sectionLabel: Record<(typeof LIST_SECTIONS)[number], Parameters<typeof t>[0]> = {
    whyWeWin: 'competitors.section.whyWeWin',
    whyWeLose: 'competitors.section.whyWeLose',
    landmines: 'competitors.section.landmines',
    proofPoints: 'competitors.section.proofPoints',
  };

  let saving = $state(false);
  let draft = $state(fromCard());
</script>

<form class="flex flex-col gap-4" onsubmit={save}>
  <Card class="flex flex-col gap-4">
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label={t('competitors.name')}><Input bind:value={draft.name} required maxlength={200} /></Field>
      <Field label={t('competitors.website')}><Input bind:value={draft.website} maxlength={500} /></Field>
      <Field label={t('competitors.area')}><Input bind:value={draft.area} maxlength={200} /></Field>
      <Field label={t('competitors.status')}>
        <Select bind:value={draft.status}>
          <option value="ACTIVE">{t('competitors.status.ACTIVE')}</option>
          <option value="ARCHIVED">{t('competitors.status.ARCHIVED')}</option>
        </Select>
      </Field>
      <Field label={t('competitors.tags')} helper={t('competitors.commaHint')}><Input bind:value={draft.tags} /></Field>
      <Field label={t('competitors.nafCodes')} helper={t('competitors.commaHint')}><Input bind:value={draft.nafCodes} placeholder="6201Z" /></Field>
    </div>
    <Field label={t('competitors.section.overview')}><Textarea bind:value={draft.overview} rows={4} /></Field>
    <Field label={t('competitors.section.pricing')}><Textarea bind:value={draft.pricing} rows={3} /></Field>
  </Card>
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
    {#each LIST_SECTIONS as key (key)}
      <Card class="flex flex-col gap-3">
        <h3 class="text-fc-md font-semibold text-fc-fg">{t(sectionLabel[key])}</h3>
        <ListEditor bind:items={draft[key]} label={t(sectionLabel[key])} />
      </Card>
    {/each}
  </div>
  <Card class="flex flex-col gap-3">
    <h3 class="text-fc-md font-semibold text-fc-fg">{t('competitors.section.objections')}</h3>
    <ObjectionsEditor bind:items={draft.objections} />
  </Card>
  <Card class="flex flex-col gap-3">
    <Field label={t('competitors.notes')}><Textarea bind:value={draft.notes} rows={3} /></Field>
  </Card>
  <div class="flex flex-wrap justify-end gap-2">
    <Button variant="ghost" onclick={onCancel}>{t('common.cancel')}</Button>
    <Button type="submit" disabled={saving}>
      {#if saving}<Spinner size="sm" />{/if}
      {t('common.save')}
    </Button>
  </div>
</form>
