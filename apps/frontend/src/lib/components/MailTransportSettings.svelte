<script lang="ts">
  import { onMount } from 'svelte';
  import { trpc } from '$lib/trpc';
  import { Alert, Button, Field, Select, SettingsRow, SettingsSection, Switch, icons, toast } from '@facile/muse';

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
      accounts = await trpc.email.listCourrierAccounts.query(scope);
      if (!accountId) {
        const first = accounts.find((a) => a.isDefault) ?? accounts[0];
        if (first) accountId = String(first.id);
      }
    } catch (error) {
      accounts = [];
      accountsError = error instanceof Error ? error.message : 'Impossible de charger les comptes Courrier';
    }
  }

  async function save() {
    saving = true;
    try {
      const result = await trpc.email.setMailTransport.mutate({
        teamId,
        transport: useCourrier ? 'COURRIER' : 'SMTP',
        courrierAccountId: useCourrier && accountId ? Number(accountId) : null,
      });
      saved = {
        useCourrier: result.transport === 'COURRIER',
        accountId: result.courrierAccountId ? String(result.courrierAccountId) : '',
      };
      toast.success("Mode d'envoi enregistré");
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : "Échec de l'enregistrement");
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
      const current = await trpc.email.getMailTransport.query(scope);
      enabled = current.courrierEnabled;
      useCourrier = current.transport === 'COURRIER';
      accountId = current.courrierAccountId ? String(current.courrierAccountId) : '';
      saved = { useCourrier, accountId };
      if (enabled && useCourrier) await loadAccounts();
    } catch (error) {
      accountsError = error instanceof Error ? error.message : 'Impossible de charger le mode d\'envoi';
    } finally {
      loading = false;
    }
  });
</script>

{#if !loading && enabled}
  <SettingsSection
    title="Envoi via Courrier"
    description="Envoyez la prospection depuis votre boîte Courrier. Le SMTP ci-dessous reste utilisé sinon."
  >
    {#snippet actions()}
      {#if canEdit}
        <Button icon={icons.check} onclick={save} disabled={saving || !dirty || (useCourrier && !accountId)}>
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      {/if}
    {/snippet}

    <SettingsRow
      label="Envoyer avec Courrier"
      description="Les emails partent du compte choisi et apparaissent dans ses éléments envoyés. Les réponses sont détectées automatiquement."
    >
      <Switch
        checked={useCourrier}
        disabled={!canEdit}
        onchange={(e: Event) => toggle((e.currentTarget as HTMLInputElement).checked)}
        aria-label="Envoyer avec Courrier"
      />
    </SettingsRow>

    {#if useCourrier}
      <SettingsRow stacked>
        {#if accountsError}
          <Alert tone="warning">{accountsError}</Alert>
        {:else}
          <Field label="Compte Courrier" for="courrierAccount">
            <Select id="courrierAccount" bind:value={accountId} disabled={!canEdit}>
              <option value="" disabled>Choisir un compte</option>
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
