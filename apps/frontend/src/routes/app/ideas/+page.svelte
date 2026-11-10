<script lang="ts">
  import { onMount } from 'svelte';
  import { IdeasPage, IdeasUpsell, toast, type ApprovalRequest, type Idea } from '@facile/muse';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { ideasStore } from '$lib/stores/ideas.svelte';
  import { toIdea } from '$lib/ideas/cards';
  import { SPACES_URL } from '$lib/preferences';
  import { useT } from '$lib/i18n';

  const t = useT();
  const teamId = $derived(teamContextStore.getTeamId());
  const cards = $derived((ideasStore.page?.ideas ?? []).map((idea) => toIdea(idea, ideasStore.runs[idea.id], t)));
  const upgradeHref = $derived(ideasStore.upgradeUrl || ideasStore.page?.upgradeUrl || SPACES_URL);

  const examples = $derived([
    { kind: 'follow_up', title: t('ideas.example.lead.title'), why: t('ideas.example.lead.why') },
    { kind: 'research', title: t('ideas.example.competitor.title'), why: t('ideas.example.competitor.why') },
    { kind: 'research', title: t('ideas.example.segment.title'), why: t('ideas.example.segment.why') },
  ]);

  onMount(() => void ideasStore.load(teamId));

  async function dismiss(idea: Idea) {
    if (await ideasStore.dismiss(idea.id)) toast.info(t('ideas.dismissed'));
  }

  function answer(idea: Idea, approval: ApprovalRequest, approve: boolean) {
    void ideasStore.decide(idea.id, approval.id, approve);
  }
</script>

{#if ideasStore.upsell}
  <IdeasUpsell {upgradeHref} {examples} />
{:else}
  <IdeasPage
    ideas={cards}
    loading={ideasStore.loading}
    generating={ideasStore.generating}
    error={ideasStore.error ? t(ideasStore.error) : null}
    lastGeneratedAt={ideasStore.page?.lastBatchAt ?? null}
    busyIds={ideasStore.busyIds}
    description={t('ideas.description')}
    onGenerate={() => void ideasStore.generate()}
    onRetry={() => void ideasStore.load(teamId)}
    onRun={(idea) => void ideasStore.run(idea.id)}
    onDismiss={dismiss}
    onApprove={(idea, approval) => answer(idea, approval, true)}
    onDecline={(idea, approval) => answer(idea, approval, false)}
  />
{/if}
