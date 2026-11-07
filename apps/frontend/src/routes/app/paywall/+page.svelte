<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Badge, Button, Card, Icon, PageHeader, Spinner, icons } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { useT } from '$lib/i18n';
  import { teamContextStore } from '$lib/stores/team-context.svelte';

  const t = useT();

  type Status = {
    scope: 'personal' | 'team';
    allowed: boolean;
    enforced: boolean;
    upgradeUrl: string;
    plans: string[];
  };

  let status = $state<Status | null>(null);
  let loading = $state(true);
  let failed = $state(false);

  const context = $derived(teamContextStore.context);
  const scopeName = $derived(context.type === 'team' ? context.name : t('paywall.yourSpace'));
  const upgradeHref = $derived(safeUrl(status?.upgradeUrl));

  function safeUrl(url: string | undefined): string | null {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' ? parsed.href : null;
    } catch {
      return null;
    }
  }

  onMount(async () => {
    try {
      const teamId = context.type === 'team' ? context.teamId : undefined;
      status = await trpc.forfait.status.query(teamId ? { teamId } : undefined);
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  });
</script>

<PageHeader title={t('paywall.title')} description={t('paywall.subtitle')} />

{#if loading}
  <Card class="flex items-center justify-center py-16">
    <Spinner size="lg" />
  </Card>
{:else if status?.allowed}
  <Card class="flex flex-col items-center gap-4 py-12 text-center">
    <Icon icon={icons.check} size={32} />
    <p class="text-fc-fg">{t('paywall.included', { scope: scopeName })}</p>
    <Button iconRight={icons.arrow} onclick={() => goto(resolve('/app/hunts'))}>{t('paywall.backToApp')}</Button>
  </Card>
{:else}
  <Card class="flex flex-col items-center gap-6 py-12 text-center">
    <Icon icon={icons.shield} size={32} />
    <div class="flex flex-col items-center gap-2">
      <div class="flex gap-2">
        {#each status?.plans ?? ['Pro', 'Studio'] as plan (plan)}
          <Badge>{plan}</Badge>
        {/each}
      </div>
      <p class="max-w-prose text-fc-fg">
        {t('paywall.notIncluded', { scope: scopeName })}
      </p>
      <p class="max-w-prose text-fc-sm text-fc-fg-muted">
        {t('paywall.kept')}
      </p>
    </div>
    {#if upgradeHref}
      <Button icon={icons.card} href={upgradeHref}>{t('paywall.seePlans')}</Button>
    {:else if failed}
      <p class="text-fc-sm text-fc-fg-muted">{t('paywall.loadFailed')}</p>
    {/if}
  </Card>
{/if}
