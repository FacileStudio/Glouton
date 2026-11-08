<script lang="ts">
  import { resolve } from '$app/paths';
  import { Alert, Button, Field, Modal, RadioGroup, Select, Spinner, toast } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { useT } from '$lib/i18n';
  import { COMPETITOR_LOSS_REASONS, LOSS_REASONS, type CompetitorLossReason, type LossReason } from './labels';

  interface Props {
    open: boolean;
    leadId: string;
    teamId: string | undefined;
    competitors: { id: string; name: string }[];
    onClosed: () => void;
  }

  let { open = $bindable(), leadId, teamId, competitors, onClosed }: Props = $props();
  const t = useT();

  let outcome = $state<'WON' | 'LOST'>('LOST');
  let lossReason = $state<'' | LossReason>('');
  let lostToCompetitorId = $state('');
  let competitorLossReason = $state<'' | CompetitorLossReason>('');
  let wonAgainstCompetitorId = $state('');
  let saving = $state(false);
  let error = $state('');

  const toCompetitor = $derived(outcome === 'LOST' && lossReason === 'LOST_TO_COMPETITOR');

  function validate(): string {
    if (outcome === 'WON') return '';
    if (!lossReason) return t('close.reasonRequired');
    if (toCompetitor && (!lostToCompetitorId || !competitorLossReason)) return t('close.required');
    return '';
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    error = validate();
    if (error) return;
    saving = true;
    try {
      await trpc.competitor.closeLead.mutate({
        teamId,
        leadId,
        outcome,
        lossReason: outcome === 'LOST' ? lossReason || null : null,
        lostToCompetitorId: toCompetitor ? lostToCompetitorId : null,
        competitorLossReason: toCompetitor ? competitorLossReason || null : null,
        wonAgainstCompetitorId: outcome === 'WON' ? wonAgainstCompetitorId || null : null,
      });
      toast.success(t('close.done'));
      open = false;
      onClosed();
    } catch (err) {
      error = getTrpcErrorMessage(err);
    } finally {
      saving = false;
    }
  }
</script>

<Modal bind:open title={t('close.title')} onClose={() => (open = false)}>
  <form id="close-lead" class="flex flex-col gap-4" onsubmit={submit} novalidate>
    <Field label={t('close.outcome')}>
      <RadioGroup
        orientation="horizontal"
        bind:value={outcome}
        options={[
          { value: 'WON', label: t('close.WON') },
          { value: 'LOST', label: t('close.LOST') },
        ]}
      />
    </Field>

    {#if outcome === 'LOST'}
      <Field label={t('close.reason')}>
        <Select bind:value={lossReason} placeholder={t('close.pickReason')} aria-invalid={Boolean(error) && !lossReason}>
          {#each LOSS_REASONS as reason (reason)}<option value={reason}>{t(`lossReason.${reason}`)}</option>{/each}
        </Select>
      </Field>
      {#if toCompetitor}
        {#if competitors.length === 0}
          <Alert tone="warning">
            {t('close.noCompetitors')}
            <a class="underline" href={resolve('/app/competitors')}>{t('nav.competitors')}</a>
          </Alert>
        {:else}
          <Field label={t('close.competitor')}>
            <Select bind:value={lostToCompetitorId} placeholder={t('close.pickCompetitor')} aria-invalid={Boolean(error) && !lostToCompetitorId}>
              {#each competitors as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
            </Select>
          </Field>
          <Field label={t('close.competitorReason')}>
            <Select bind:value={competitorLossReason} placeholder={t('close.pickReason')} aria-invalid={Boolean(error) && !competitorLossReason}>
              {#each COMPETITOR_LOSS_REASONS as reason (reason)}<option value={reason}>{t(`competitorLoss.${reason}`)}</option>{/each}
            </Select>
          </Field>
        {/if}
      {/if}
    {:else if competitors.length > 0}
      <Field label={t('close.wonAgainst')}>
        <Select bind:value={wonAgainstCompetitorId}>
          <option value="">{t('close.noCompetitor')}</option>
          {#each competitors as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </Select>
      </Field>
    {/if}

    {#if error}<Alert tone="danger">{error}</Alert>{/if}
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>{t('common.cancel')}</Button>
    <Button type="submit" form="close-lead" disabled={saving}>
      {#if saving}<Spinner size="sm" />{/if}
      {t('close.submit')}
    </Button>
  {/snippet}
</Modal>
