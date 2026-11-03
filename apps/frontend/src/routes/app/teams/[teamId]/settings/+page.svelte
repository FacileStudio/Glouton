<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import MailTransportSettings from '$lib/components/MailTransportSettings.svelte';
  import {
    Alert,
    Badge,
    Button,
    Field,
    Icon,
    Input,
    Modal,
    PageHeader,
    SettingsRow,
    SettingsSection,
    Spinner,
    Switch,
    Tabs,
    Textarea,
    icons,
    toast,
  } from '@facile/muse';

  let teamId = $derived(page.params.teamId);
  let team = $state<any>(null);
  let loading = $state(true);
  let activeTab = $state('general');
  let saving = $state(false);
  let testingSmtp = $state(false);
  let deleteModalOpen = $state(false);
  let deleteConfirmationText = $state('');
  let deleting = $state(false);

  let generalForm = $state({
    name: '',
    description: '',
  });

  let apiKeysForm = $state({
    hunterApiKey: '',
    googleMapsApiKey: '',
  });

  let smtpForm = $state({
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    smtpFromName: '',
    smtpFromEmail: '',
  });

  let showApiKeys = $state({
    hunterApiKey: false,
    googleMapsApiKey: false,
  });

  let showSmtpPass = $state(false);

  let originalGeneralForm = $state({ name: '', description: '' });
  let originalApiKeysForm = $state({ ...apiKeysForm });
  let originalSmtpForm = $state({ ...smtpForm });

  let hasGeneralChanges = $derived(
    generalForm.name !== originalGeneralForm.name ||
    generalForm.description !== originalGeneralForm.description
  );

  let hasApiKeysChanges = $derived(
    Object.keys(apiKeysForm).some(
      (key) => apiKeysForm[key as keyof typeof apiKeysForm] !== originalApiKeysForm[key as keyof typeof originalApiKeysForm]
    )
  );

  let hasSmtpChanges = $derived(
    Object.keys(smtpForm).some(
      (key) => smtpForm[key as keyof typeof smtpForm] !== originalSmtpForm[key as keyof typeof originalSmtpForm]
    )
  );

  let canManage = $derived(team && (team.userRole === 'OWNER' || team.userRole === 'ADMIN'));
  let isOwner = $derived(team && team.userRole === 'OWNER');
  let linked = $derived(Boolean(team?.registreSpaceId));

  onMount(async () => {
    await loadTeam();
  });

  async function loadTeam() {
    loading = true;
    try {
      team = await trpc.team.get.query({ teamId });
      generalForm.name = team.name;
      generalForm.description = team.description || '';
      originalGeneralForm.name = team.name;
      originalGeneralForm.description = team.description || '';

      if (team.userRole === 'OWNER' || team.userRole === 'ADMIN') {
        await Promise.all([loadApiKeys(), loadSmtpConfig()]);
      }
    } catch (error: any) {
      console.error('Error loading team:', error);
      toast.danger(error?.message || 'Échec du chargement de l\'espace');
      goto('/app/teams');
    } finally{
      loading = false;
    }
  }

  async function loadApiKeys() {
    try {
      const apiKeys = await trpc.team.getApiKeys.query({ teamId });
      apiKeysForm.hunterApiKey = apiKeys.hunterApiKey || '';
      apiKeysForm.googleMapsApiKey = apiKeys.googleMapsApiKey || '';
      originalApiKeysForm = { ...apiKeysForm };
    } catch (error) {
      console.error('Error loading API keys:', error);
    }
  }

  async function loadSmtpConfig() {
    try {
      const smtpConfig = await trpc.team.getSmtpConfig.query({ teamId });
      smtpForm.smtpHost = smtpConfig.smtpHost || '';
      smtpForm.smtpPort = smtpConfig.smtpPort || 587;
      smtpForm.smtpSecure = smtpConfig.smtpSecure || false;
      smtpForm.smtpUser = smtpConfig.smtpUser || '';
      smtpForm.smtpPass = smtpConfig.smtpPass || '';
      smtpForm.smtpFromName = smtpConfig.smtpFromName || '';
      smtpForm.smtpFromEmail = smtpConfig.smtpFromEmail || '';
      originalSmtpForm = { ...smtpForm };
    } catch (error) {
      console.error('Error loading SMTP config:', error);
    }
  }

  async function handleUpdateGeneral() {
    if (!canManage) return;
    saving = true;
    try {
      await trpc.team.update.mutate({
        teamId,
        name: generalForm.name.trim(),
        description: generalForm.description.trim() || undefined,
      });
      originalGeneralForm.name = generalForm.name;
      originalGeneralForm.description = generalForm.description;
      toast.success('Informations mises à jour avec succès');
      await loadTeam();
    } catch (error: any) {
      toast.danger(error?.message || 'Échec de la mise à jour');
    } finally {
      saving = false;
    }
  }

  async function handleUpdateApiKeys() {
    if (!canManage) return;
    saving = true;
    try {
      await trpc.team.updateApiKeys.mutate({
        teamId,
        hunterApiKey: apiKeysForm.hunterApiKey || undefined,
        googleMapsApiKey: apiKeysForm.googleMapsApiKey || undefined,
      });
      await loadApiKeys();
      toast.success('Clés API mises à jour avec succès');
    } catch (error: any) {
      toast.danger(error?.message || 'Échec de la mise à jour des clés API');
    } finally {
      saving = false;
    }
  }

  async function handleTestSmtp() {
    if (!canManage) return;
    testingSmtp = true;
    try {
      const result = await trpc.team.testSmtpConfig.mutate({
        teamId,
        smtpHost: smtpForm.smtpHost,
        smtpPort: smtpForm.smtpPort,
        smtpSecure: smtpForm.smtpSecure,
        smtpUser: smtpForm.smtpUser,
        smtpPass: smtpForm.smtpPass,
        smtpFromName: smtpForm.smtpFromName,
        smtpFromEmail: smtpForm.smtpFromEmail,
      });
      toast.success(result.message);
    } catch (error: any) {
      toast.danger(error?.message || 'Configuration SMTP invalide');
    } finally {
      testingSmtp = false;
    }
  }

  async function handleUpdateSmtp() {
    if (!canManage) return;
    saving = true;
    try {
      await trpc.team.updateSmtpConfig.mutate({
        teamId,
        smtpHost: smtpForm.smtpHost || undefined,
        smtpPort: smtpForm.smtpPort || undefined,
        smtpSecure: smtpForm.smtpSecure,
        smtpUser: smtpForm.smtpUser || undefined,
        smtpPass: smtpForm.smtpPass || undefined,
        smtpFromName: smtpForm.smtpFromName || undefined,
        smtpFromEmail: smtpForm.smtpFromEmail || undefined,
      });
      await loadSmtpConfig();
      toast.success('Configuration SMTP mise à jour avec succès');
    } catch (error: any) {
      toast.danger(error?.message || 'Échec de la mise à jour de la config SMTP');
    } finally {
      saving = false;
    }
  }

  async function handleDeleteTeam() {
    if (!isOwner || deleteConfirmationText !== 'DELETE') return;
    deleting = true;
    try {
      await trpc.team.delete.mutate({ teamId });
      toast.success('Espace supprimé avec succès');
      goto('/app/teams');
    } catch (error: any) {
      toast.danger(error?.message || 'Échec de la suppression de l\'espace');
      deleteModalOpen = false;
    } finally {
      deleting = false;
    }
  }

  function openDeleteModal() {
    deleteModalOpen = true;
    deleteConfirmationText = '';
  }

  const tabs = [
    { id: 'general', label: 'Général', icon: icons.settings },
    { id: 'api-keys', label: 'Clés API', icon: icons.key },
    { id: 'smtp', label: 'SMTP', icon: icons.mail },
  ];

  const providers: { key: keyof typeof apiKeysForm; label: string; url: string }[] = [
    { key: 'hunterApiKey', label: 'Hunter.io', url: 'https://hunter.io/api' },
    { key: 'googleMapsApiKey', label: 'Google Maps', url: 'https://console.cloud.google.com' },
  ];

  const revealButtonClass =
    'absolute top-0 right-0 inline-flex size-11 items-center justify-center rounded-fc-md text-fc-fg-muted transition-colors hover:text-fc-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring';
</script>

{#if loading}
  <div class="flex items-center justify-center py-16">
    <Spinner size="lg" label="Chargement de l'espace" />
  </div>
{:else if team}
  <div class="mx-auto flex w-full max-w-fc-lg flex-col gap-10">
    <PageHeader
      title="Paramètres de {team.name}"
      description="Gérez les paramètres de votre espace"
      back={{ href: `/app/teams/${teamId}`, label: team.name }}
    />

    {#if !canManage}
      <Alert tone="warning">
        Vous n'avez pas les permissions nécessaires pour modifier ces paramètres. Contactez un
        administrateur.
      </Alert>
    {/if}

    <Tabs items={tabs} value={activeTab} onChange={(id) => (activeTab = id)} label="Sections des paramètres" />

    {#if activeTab === 'general'}
      <SettingsSection
        title="Informations générales"
        description="Modifiez les informations de base de votre espace"
      >
        {#snippet actions()}
          {#if canManage}
            <Button icon={icons.check} onclick={handleUpdateGeneral} disabled={saving || !hasGeneralChanges}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          {/if}
        {/snippet}

        <SettingsRow stacked>
          <Field
            label="Nom de l'espace"
            helper={linked ? 'Le nom, les membres et les rôles se gèrent dans Registre.' : undefined}
            for="name"
          >
            <Input
              id="name"
              bind:value={generalForm.name}
              disabled={!canManage || linked}
              placeholder="Espace Marketing"
            />
          </Field>
        </SettingsRow>

        <SettingsRow stacked>
          <Field label="Description" for="description">
            <Textarea
              id="description"
              bind:value={generalForm.description}
              disabled={!canManage}
              placeholder="Décrivez l'objectif de cet espace..."
              rows={4}
              class="min-h-24 resize-none disabled:cursor-not-allowed"
            />
          </Field>
        </SettingsRow>
      </SettingsSection>

      {#if linked && team.manageUrl}
        <SettingsSection title="Registre" description="Cet espace est partagé avec toutes les apps Facile.">
          <SettingsRow
            label="Membres, rôles et nom"
            description="Ajoutez, retirez ou renommez dans Registre ; Glouton se met à jour en quelques secondes."
          >
            <Button variant="outline" icon={icons.space} href={team.manageUrl}>Gérer dans Registre</Button>
          </SettingsRow>
        </SettingsSection>
      {:else if isOwner}
        <SettingsSection title="Zone de danger" description="Ces actions sont irréversibles.">
          <SettingsRow
            label="Supprimer l'espace"
            description="La suppression de cet espace est définitive. Toutes les données associées seront effacées immédiatement."
          >
            <Button variant="danger" icon={icons.remove} onclick={openDeleteModal}>
              Supprimer l'espace
            </Button>
          </SettingsRow>
        </SettingsSection>
      {/if}
    {:else if activeTab === 'api-keys'}
      <SettingsSection
        title="Clés API"
        description="Configurez les clés API pour les sources de leads de l'espace"
      >
        {#snippet actions()}
          {#if canManage}
            <Button icon={icons.check} onclick={handleUpdateApiKeys} disabled={saving || !hasApiKeysChanges}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          {/if}
        {/snippet}

        {#each providers as provider (provider.key)}
          <SettingsRow stacked>
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center gap-2">
                <label for={provider.key} class="text-fc-sm text-fc-fg">{provider.label}</label>
                {#if apiKeysForm[provider.key]}
                  <Badge tone="success">
                    <Icon icon={icons.check} size={12} />
                    Configuré
                  </Badge>
                {/if}
              </div>
              <div class="relative">
                <Input
                  id={provider.key}
                  type={showApiKeys[provider.key] ? 'text' : 'password'}
                  bind:value={apiKeysForm[provider.key]}
                  disabled={!canManage}
                  placeholder={`Entrez votre clé API ${provider.label}`}
                  class="pr-12 font-fc-mono"
                />
                {#if apiKeysForm[provider.key]}
                  <button
                    type="button"
                    aria-label="Afficher ou masquer la clé API {provider.label}"
                    aria-pressed={showApiKeys[provider.key]}
                    onclick={() => (showApiKeys[provider.key] = !showApiKeys[provider.key])}
                    class={revealButtonClass}
                  >
                    <Icon icon={showApiKeys[provider.key] ? icons.eye : icons.eyeClosed} size={16} />
                  </button>
                {/if}
              </div>
              <p class="text-fc-xs text-fc-fg-muted">
                Obtenez votre clé sur <a
                  href={provider.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="underline hover:text-fc-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring"
                  >{provider.url}</a
                >
              </p>
            </div>
          </SettingsRow>
        {/each}
      </SettingsSection>
    {:else if activeTab === 'smtp'}
      <MailTransportSettings {teamId} canEdit={Boolean(canManage)} />

      <SettingsSection
        title="Configuration SMTP"
        description="Configurez le serveur SMTP pour l'envoi d'emails de l'espace"
      >
        {#snippet actions()}
          {#if canManage}
            <Button variant="outline" onclick={handleTestSmtp} disabled={testingSmtp || saving}>
              <iconify-icon icon="solar:test-tube-linear" width="16" height="16" class="block"></iconify-icon>
              {testingSmtp ? 'Test en cours...' : 'Tester la configuration'}
            </Button>
            <Button icon={icons.check} onclick={handleUpdateSmtp} disabled={saving || !hasSmtpChanges}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          {/if}
        {/snippet}

        <SettingsRow stacked>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Hôte SMTP" for="smtpHost">
              <Input
                id="smtpHost"
                bind:value={smtpForm.smtpHost}
                disabled={!canManage}
                placeholder="smtp.gmail.com"
              />
            </Field>
            <Field label="Port SMTP" for="smtpPort">
              <Input
                id="smtpPort"
                type="number"
                bind:value={smtpForm.smtpPort}
                disabled={!canManage}
                placeholder="587"
              />
            </Field>
          </div>
        </SettingsRow>

        <SettingsRow label="Utiliser SSL/TLS (port 465)">
          <Switch
            bind:checked={smtpForm.smtpSecure}
            disabled={!canManage}
            aria-label="Utiliser SSL/TLS (port 465)"
          />
        </SettingsRow>

        <SettingsRow stacked>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Nom d'utilisateur" for="smtpUser">
              <Input
                id="smtpUser"
                bind:value={smtpForm.smtpUser}
                disabled={!canManage}
                placeholder="votre@email.com"
              />
            </Field>
            <Field label="Mot de passe" for="smtpPass">
              <div class="relative">
                <Input
                  id="smtpPass"
                  type={showSmtpPass ? 'text' : 'password'}
                  bind:value={smtpForm.smtpPass}
                  disabled={!canManage}
                  placeholder="••••••••"
                  class="pr-12"
                />
                {#if smtpForm.smtpPass}
                  <button
                    type="button"
                    aria-label="Afficher ou masquer le mot de passe SMTP"
                    aria-pressed={showSmtpPass}
                    onclick={() => (showSmtpPass = !showSmtpPass)}
                    class={revealButtonClass}
                  >
                    <Icon icon={showSmtpPass ? icons.eye : icons.eyeClosed} size={16} />
                  </button>
                {/if}
              </div>
            </Field>
          </div>
        </SettingsRow>

        <SettingsRow stacked>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Nom de l'expéditeur" for="smtpFromName">
              <Input
                id="smtpFromName"
                bind:value={smtpForm.smtpFromName}
                disabled={!canManage}
                placeholder="Votre Espace"
              />
            </Field>
            <Field label="Email de l'expéditeur" for="smtpFromEmail">
              <Input
                id="smtpFromEmail"
                type="email"
                bind:value={smtpForm.smtpFromEmail}
                disabled={!canManage}
                placeholder="espace@votredomain.com"
              />
            </Field>
          </div>
        </SettingsRow>
      </SettingsSection>
    {/if}
  </div>
{/if}

<Modal bind:open={deleteModalOpen} title="Supprimer l'espace ?">
  <p class="text-fc-sm text-fc-fg-muted">
    Cette action est définitive. Toutes les données de l'espace seront supprimées.
  </p>

  <Field label={'Tapez "DELETE" pour confirmer'} for="deleteConfirm">
    <Input id="deleteConfirm" type="text" bind:value={deleteConfirmationText} placeholder="DELETE" />
  </Field>

  {#snippet footer()}
    <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="ghost" onclick={() => (deleteModalOpen = false)}>Annuler</Button>
      <Button
        variant="danger"
        onclick={handleDeleteTeam}
        disabled={deleteConfirmationText !== 'DELETE' || deleting}
      >
        {deleting ? 'Suppression...' : 'Confirmer'}
      </Button>
    </div>
  {/snippet}
</Modal>
