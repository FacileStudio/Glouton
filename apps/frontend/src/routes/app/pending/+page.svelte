<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner, toast } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { useFormat, useT } from '$lib/i18n';

  const t = useT();
  const format = useFormat();

  type Action = Awaited<ReturnType<typeof trpc.mcp.pending.query>>[number];

  const KINDS = { delete_company: 'pending.kind.delete_company', delete_person: 'pending.kind.delete_person' } as const;
  const BADGES = {
    ready: { tone: 'info', label: 'pending.badge.ready' },
    changed: { tone: 'warning', label: 'pending.badge.changed' },
    missing: { tone: 'neutral', label: 'pending.badge.missing' },
  } as const;

  let actions = $state<Action[]>([]);
  let loading = $state(true);
  let busy = $state<string | null>(null);

  const wanted = $derived(page.url.searchParams.get('action') ?? '');
  const gone = $derived(!loading && wanted !== '' && !actions.some((a) => a.id === wanted));
  const ordered = $derived([...actions].sort((a, b) => Number(b.id === wanted) - Number(a.id === wanted)));

  function kindLabel(kind: string) {
    return t(KINDS[kind as keyof typeof KINDS] ?? 'pending.kind.other');
  }

  function badgeOf(state: string) {
    return BADGES[state as keyof typeof BADGES] ?? BADGES.missing;
  }

  async function load() {
    try {
      actions = await trpc.mcp.pending.query();
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      loading = false;
    }
  }

  async function decide(action: Action, confirm: boolean) {
    busy = action.id;
    try {
      if (confirm) await trpc.mcp.confirm.mutate({ id: action.id });
      else await trpc.mcp.dismiss.mutate({ id: action.id });
      toast.success(t(confirm ? 'pending.confirmed' : 'pending.dismissed'));
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      busy = null;
      await load();
    }
  }

  onMount(load);
</script>

<PageHeader title={t('title.pending')} description={t('pending.subtitle')} />

<div class="flex flex-col gap-4">
  {#if gone}
    <Alert tone="info">{t('pending.gone')}</Alert>
  {/if}

  {#if loading}
    <Card class="flex items-center justify-center py-16">
      <Spinner size="lg" />
    </Card>
  {:else if actions.length === 0}
    <EmptyState icon="solar:shield-check-linear" title={t('pending.none')} description={t('pending.noneText')} />
  {:else}
    {#each ordered as action (action.id)}
      {@const badge = badgeOf(action.state)}
      <Card class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-fc-md font-medium text-fc-fg">{kindLabel(action.kind)}</h2>
          <Badge tone={badge.tone}>{t(badge.label)}</Badge>
        </div>
        <p class="text-fc-fg">{action.summary}</p>
        <p class="text-fc-sm text-fc-fg-muted">{t('pending.asked', { date: format.dateTime(action.createdAt) })}</p>
        {#if action.state !== 'ready'}
          <p class="text-fc-sm text-fc-fg-muted">{t(action.state === 'changed' ? 'pending.state.changed' : 'pending.state.missing')}</p>
        {/if}
        <div class="flex flex-wrap gap-2">
          <Button
            icon="solar:check-circle-linear"
            disabled={busy !== null || action.state !== 'ready'}
            onclick={() => decide(action, true)}
          >
            {t('pending.confirm')}
          </Button>
          <Button variant="ghost" disabled={busy !== null} onclick={() => decide(action, false)}>{t('pending.dismiss')}</Button>
        </div>
      </Card>
    {/each}
  {/if}
</div>
