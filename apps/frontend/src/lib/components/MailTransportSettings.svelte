<script lang="ts">
  import { onMount } from 'svelte';
  import { trpc } from '$lib/trpc';
  import { QUIET } from '@repo/trpc-client';
  import { Alert, Button, Field, Select, SettingsRow, SettingsSection, Switch, icons, toast } from '@facile/muse';
  import { useT } from '$lib/i18n';

  const t = useT();

  interface Props {
    teamId?: string;
    canEdit?: boolean;
  }

  let { teamId, canEdit = true }: Props = $props();

  let loading = $state(true);
  let saving = $state(false);
  let enabled = $state(false);
  let useCourrier = $state(false);
  let accountId = $state('');
  let saved = $state({ useCourrier: false, accountId: '' });
  let accounts = $state<Awaited<ReturnType<typeof trpc.email.listCourrierAccounts.query>>>([]);
  let accountsError = $state<string | null>(null);

  let dirty = $derived(useCourrier !== saved.useCourrier || (useCourrier && accountId !== saved.accountId));
  let scope = $derived(teamId ? { teamId } : undefined);

  async function loadAccounts() {
    accountsError = null;
    try {
      accounts = await trpc.email.listCourrierAccounts.query(scope, { context: QUIET });
      if (!accountId) {
        const first = accounts.find((a) => a.isDefault) ?? accounts[0];
        if (first) accountId = String(first.id);
      }
    } catch (error) {
      accounts = [];
      accountsError = error instanceof Error ? error.message : t('mail.accountsFailed');
    }
  }

  async function save() {
    saving = true;
    try {
      const result = await trpc.email.setMailTransport.mutate({
        teamId,
        transport: useCourrier ? 'COURRIER' : 'SMTP',
        courrierAccountId: useCourrier && accountId ? Number(accountId) : null,
      }, { context: QUIET });
      saved = {
        useCourrier: result.transport === 'COURRIER',
        accountId: result.courrierAccountId ? String(result.courrierAccountId) : '',
      };
      toast.success(t('mail.saved'));
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : t('mail.saveFailed'));
    } finally {
      saving = false;
    }
  }

  async function toggle(value: boolean) {
    useCourrier = value;
    if (value && accounts.length === 0) await loadAccounts();
  }

  onMount(async () => {
    try {
      const current = await trpc.email.getMailTransport.query(scope, { context: QUIET });
      enabled = current.courrierEnabled;
      useCourrier = current.transport === 'COURRIER';
      accountId = current.courrierAccountId ? String(current.courrierAccountId) : '';
      saved = { useCourrier, accountId };
      if (enabled && useCourrier) await loadAccounts();
    } catch (error) {
      accountsError = error instanceof Error ? error.message : t('mail.loadFailed');
    } finally {
      loading = false;
    }
  });
</script>

{#if !loading && enabled}
  <SettingsSection
    title={t('mail.title')}
    description={t('mail.description')}
  >
    {#snippet actions()}
      {#if canEdit}
        <Button icon={icons.check} onclick={save} disabled={saving || !dirty || (useCourrier && !accountId)}>
          {saving ? t('common.saving') : t('common.save')}
        </Button>
      {/if}
    {/snippet}

    <SettingsRow
      label={t('mail.use')}
      description={t('mail.useHint')}
    >
      <Switch
        checked={useCourrier}
        disabled={!canEdit}
        onchange={(e: Event) => toggle((e.currentTarget as HTMLInputElement).checked)}
        aria-label={t('mail.use')}
      />
    </SettingsRow>

    {#if useCourrier}
      <SettingsRow stacked>
        {#if accountsError}
          <Alert tone="warning" class="w-full">{accountsError}</Alert>
        {:else}
          <Field label={t('mail.account')} for="courrierAccount" class="w-full">
            <Select id="courrierAccount" bind:value={accountId} disabled={!canEdit}>
              <option value="" disabled>{t('mail.pick')}</option>
              {#each accounts as account (account.id)}
                <option value={String(account.id)}>{account.name} ({account.email})</option>
              {/each}
            </Select>
          </Field>
        {/if}
      </SettingsRow>
    {/if}
  </SettingsSection>
{/if}
