<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { Input, Button, Spinner, Toggle, Alert } from '@repo/ui';
  import { toast } from '@repo/utils';
  import { fade, slide } from 'svelte/transition';
  import 'iconify-icon';

  let teamId = $derived($page.params.teamId);
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
    apolloApiKey: '',
    snovApiKey: '',
    hasdataApiKey: '',
    contactoutApiKey: '',
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
    apolloApiKey: false,
    snovApiKey: false,
    hasdataApiKey: false,
    contactoutApiKey: false,
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
      toast.push(error?.message || 'Échec du chargement de l\'équipe', 'error');
      goto('/app/teams');
    } finally{
      loading = false;
    }
  }

  async function loadApiKeys() {
    try {
      const apiKeys = await trpc.team.getApiKeys.query({ teamId });
      apiKeysForm.hunterApiKey = apiKeys.hunterApiKey || '';
      apiKeysForm.apolloApiKey = apiKeys.apolloApiKey || '';
      apiKeysForm.snovApiKey = apiKeys.snovApiKey || '';
      apiKeysForm.hasdataApiKey = apiKeys.hasdataApiKey || '';
      apiKeysForm.contactoutApiKey = apiKeys.contactoutApiKey || '';
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
      toast.push('Informations mises à jour avec succès', 'success');
      await loadTeam();
    } catch (error: any) {
      toast.push(error?.message || 'Échec de la mise à jour', 'error');
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
        apolloApiKey: apiKeysForm.apolloApiKey || undefined,
        snovApiKey: apiKeysForm.snovApiKey || undefined,
        hasdataApiKey: apiKeysForm.hasdataApiKey || undefined,
        contactoutApiKey: apiKeysForm.contactoutApiKey || undefined,
        googleMapsApiKey: apiKeysForm.googleMapsApiKey || undefined,
      });
      await loadApiKeys();
      toast.push('Clés API mises à jour avec succès', 'success');
    } catch (error: any) {
      toast.push(error?.message || 'Échec de la mise à jour des clés API', 'error');
    } finally {
      saving = false;
    }
  }

  async function handleTestSmtp() {
    if (!canManage) return;
    testingSmtp = true;
    try {
      toast.push('Test de la configuration SMTP...', 'info');
    } catch (error: any) {
      toast.push(error?.message || 'Configuration SMTP invalide', 'error');
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
      toast.push('Configuration SMTP mise à jour avec succès', 'success');
    } catch (error: any) {
      toast.push(error?.message || 'Échec de la mise à jour de la config SMTP', 'error');
    } finally {
      saving = false;
    }
  }

  async function handleDeleteTeam() {
    if (!isOwner || deleteConfirmationText !== 'DELETE') return;
    deleting = true;
    try {
      await trpc.team.delete.mutate({ teamId });
      toast.push('Équipe supprimée avec succès', 'success');
      goto('/app/teams');
    } catch (error: any) {
      toast.push(error?.message || 'Échec de la suppression de l\'équipe', 'error');
      deleteModalOpen = false;
    } finally {
      deleting = false;
    }
  }

  function handleBack() {
    goto(`/app/teams/${teamId}`);
  }

  const tabs = [
    { id: 'general', name: 'Général', icon: 'solar:settings-bold' },
    { id: 'api-keys', name: 'Clés API', icon: 'solar:key-bold' },
    { id: 'smtp', name: 'SMTP', icon: 'solar:letter-bold' },
  ];
</script>

<div
  class="p-6 lg:p-12 max-w-6xl mx-auto space-y-8 selection:text-black font-sans pb-32"
  style="background-color: #FAF7F5; selection-background-color: #FEC129;"
>
  {#if loading}
    <div class="flex items-center justify-center py-20">
      <Spinner size="lg" />
    </div>
  {:else if team}
    <div class="flex items-center gap-4">
      <button
        onclick={handleBack}
        class="w-12 h-12 flex items-center justify-center bg-white rounded-xl hover:bg-neutral-50 transition-colors border border-neutral-100"
      >
        <iconify-icon icon="solar:arrow-left-bold" width="20" class="text-neutral-700"></iconify-icon>
      </button>
      <div>
        <h1 class="text-3xl md:text-4xl font-black tracking-tight" style="color: #291334;">
          Paramètres de {team.name}
        </h1>
        <p class="text-neutral-500 font-medium text-base mt-1">
          Gérez les paramètres de votre équipe
        </p>
      </div>
    </div>

    {#if !canManage}
      <Alert variant="warning">
        Vous n'avez pas les permissions nécessaires pour modifier ces paramètres. Contactez un administrateur.
      </Alert>
    {/if}

    <div class="rounded-2xl shadow-lg p-2" style="background-color: #EFEAE6;">
      <div class="grid grid-cols-3 gap-2">
        {#each tabs as tab (tab.id)}
          <button
            onclick={() => (activeTab = tab.id)}
            class="flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl font-bold text-sm transition-all duration-200
            {activeTab === tab.id
              ? 'bg-brand-purple text-white shadow-md'
              : 'text-slate-600 hover:text-brand-purple hover:bg-slate-50'}"
          >
            <iconify-icon icon={tab.icon} width="20"></iconify-icon>
            {tab.name}
          </button>
        {/each}
      </div>
    </div>

    {#if activeTab === 'general'}
      <div in:fade={{ duration: 300 }} class="space-y-6">
        <div class="p-8 md:p-10 rounded-2xl shadow-lg" style="background-color: #EFEAE6;">
          <div class="mb-8">
            <h2 class="text-2xl font-black mb-2" style="color: #291334;">Informations générales</h2>
            <p class="text-neutral-500 text-sm">Modifiez les informations de base de votre équipe</p>
          </div>

          <div class="space-y-6">
            <div class="space-y-2">
              <label for="name" class="text-sm font-bold text-neutral-700 block">
                Nom de l'équipe
              </label>
              <Input
                id="name"
                bind:value={generalForm.name}
                disabled={!canManage}
                placeholder="Équipe Marketing"
                class="rounded-xl"
              />
            </div>

            <div class="space-y-2">
              <label for="description" class="text-sm font-bold text-neutral-700 block">
                Description
              </label>
              <textarea
                id="description"
                bind:value={generalForm.description}
                disabled={!canManage}
                placeholder="Décrivez l'objectif de cette équipe..."
                rows="4"
                class="w-full px-5 py-3 rounded-2xl bg-slate-50/50 border-2 border-slate-100 focus:border-brand-gold focus:bg-white hover:bg-white transition-all duration-200 font-medium text-brand-purple placeholder:text-slate-400 outline-none resize-none disabled:opacity-50 disabled:cursor-not-allowed"
              ></textarea>
            </div>
          </div>

          {#if canManage}
            <div class="flex justify-end pt-8 mt-8 border-t border-neutral-100">
              <Button
                onclick={handleUpdateGeneral}
                disabled={saving || !hasGeneralChanges}
                class="px-6 bg-black text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {#if saving}
                  <Spinner size="sm" />
                  <span>Enregistrement...</span>
                {:else}
                  <iconify-icon icon="solar:diskette-bold" width="18"></iconify-icon>
                  <span>Enregistrer</span>
                {/if}
              </Button>
            </div>
          {/if}
        </div>

        {#if isOwner}
          <div class="rounded-2xl border-2 border-red-200 shadow-lg p-8 md:p-10" style="background-color: #EFEAE6;">
            <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div>
                <h3 class="text-red-600 font-black text-xl mb-2 flex items-center gap-2">
                  <iconify-icon icon="solar:danger-triangle-bold" width="24"></iconify-icon>
                  Zone de danger
                </h3>
                <p class="text-neutral-600 text-sm leading-relaxed max-w-md">
                  La suppression de cette équipe est définitive. Toutes les données associées seront effacées immédiatement.
                </p>
              </div>
              <Button
                onclick={() => { deleteModalOpen = true; deleteConfirmationText = ''; }}
                intent="danger"
                class="flex-shrink-0"
              >
                <iconify-icon icon="solar:trash-bin-trash-bold" width="20"></iconify-icon>
                Supprimer l'équipe
              </Button>
            </div>
          </div>
        {/if}
      </div>
    {:else if activeTab === 'api-keys'}
      <div in:fade={{ duration: 300 }}>
        <div class="p-8 md:p-10 rounded-2xl shadow-lg" style="background-color: #EFEAE6;">
          <div class="mb-8">
            <h2 class="text-2xl font-black mb-2" style="color: #291334;">Clés API</h2>
            <p class="text-neutral-500 text-sm">Configurez les clés API pour les sources de leads de l'équipe</p>
          </div>

          <div class="space-y-6">
            {#each [
              { key: 'hunterApiKey', label: 'Hunter.io', url: 'https://hunter.io/api' },
              { key: 'apolloApiKey', label: 'Apollo.io', url: 'https://apollo.io/api' },
              { key: 'snovApiKey', label: 'Snov.io', url: 'https://snov.io/api' },
              { key: 'hasdataApiKey', label: 'HasData', url: 'https://hasdata.com' },
              { key: 'contactoutApiKey', label: 'ContactOut', url: 'https://contactout.com' },
              { key: 'googleMapsApiKey', label: 'Google Maps', url: 'https://console.cloud.google.com' },
            ] as provider}
              <div class="space-y-2">
                <label for={provider.key} class="text-sm font-bold text-neutral-700 flex items-center gap-2">
                  {provider.label}
                  {#if apiKeysForm[provider.key as keyof typeof apiKeysForm]}
                    <span class="text-xs font-bold text-green-600 flex items-center gap-1 px-2 py-0.5 bg-green-50 rounded-full">
                      <iconify-icon icon="solar:check-circle-bold" width="12"></iconify-icon>
                      Configuré
                    </span>
                  {/if}
                </label>
                <div class="relative">
                  <Input
                    id={provider.key}
                    type={showApiKeys[provider.key as keyof typeof showApiKeys] ? 'text' : 'password'}
                    bind:value={apiKeysForm[provider.key as keyof typeof apiKeysForm]}
                    disabled={!canManage}
                    placeholder={`Entrez votre clé API ${provider.label}`}
                    class="rounded-xl font-mono pr-10"
                  />
                  {#if apiKeysForm[provider.key as keyof typeof apiKeysForm]}
                    <button
                      type="button"
                      onclick={() => (showApiKeys[provider.key as keyof typeof showApiKeys] = !showApiKeys[provider.key as keyof typeof showApiKeys])}
                      class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                    >
                      <iconify-icon
                        icon={showApiKeys[provider.key as keyof typeof showApiKeys] ? 'solar:eye-bold' : 'solar:eye-closed-bold'}
                        width="20"
                      ></iconify-icon>
                    </button>
                  {/if}
                </div>
                <p class="text-xs text-neutral-500">
                  Obtenez votre clé sur <a href={provider.url} target="_blank" rel="noopener noreferrer" class="underline hover:text-neutral-900">{provider.url}</a>
                </p>
              </div>
            {/each}
          </div>

          {#if canManage}
            <div class="flex justify-end pt-8 mt-8 border-t border-neutral-100">
              <Button
                onclick={handleUpdateApiKeys}
                disabled={saving || !hasApiKeysChanges}
                class="px-6 bg-black text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {#if saving}
                  <Spinner size="sm" />
                  <span>Enregistrement...</span>
                {:else}
                  <iconify-icon icon="solar:diskette-bold" width="18"></iconify-icon>
                  <span>Enregistrer</span>
                {/if}
              </Button>
            </div>
          {/if}
        </div>
      </div>
    {:else if activeTab === 'smtp'}
      <div in:fade={{ duration: 300 }}>
        <div class="p-8 md:p-10 rounded-2xl shadow-lg" style="background-color: #EFEAE6;">
          <div class="mb-8">
            <h2 class="text-2xl font-black mb-2" style="color: #291334;">Configuration SMTP</h2>
            <p class="text-neutral-500 text-sm">Configurez le serveur SMTP pour l'envoi d'emails de l'équipe</p>
          </div>

          <div class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-2">
                <label for="smtpHost" class="text-sm font-bold text-neutral-700 block">Hôte SMTP</label>
                <Input
                  id="smtpHost"
                  bind:value={smtpForm.smtpHost}
                  disabled={!canManage}
                  placeholder="smtp.gmail.com"
                  class="rounded-xl"
                />
              </div>
              <div class="space-y-2">
                <label for="smtpPort" class="text-sm font-bold text-neutral-700 block">Port SMTP</label>
                <Input
                  id="smtpPort"
                  type="number"
                  bind:value={smtpForm.smtpPort}
                  disabled={!canManage}
                  placeholder="587"
                  class="rounded-xl"
                />
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-bold text-neutral-700 flex items-center gap-2">
                <Toggle bind:checked={smtpForm.smtpSecure} disabled={!canManage} />
                Utiliser SSL/TLS (port 465)
              </label>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-2">
                <label for="smtpUser" class="text-sm font-bold text-neutral-700 block">Nom d'utilisateur</label>
                <Input
                  id="smtpUser"
                  bind:value={smtpForm.smtpUser}
                  disabled={!canManage}
                  placeholder="votre@email.com"
                  class="rounded-xl"
                />
              </div>
              <div class="space-y-2">
                <label for="smtpPass" class="text-sm font-bold text-neutral-700 block">Mot de passe</label>
                <div class="relative">
                  <Input
                    id="smtpPass"
                    type={showSmtpPass ? 'text' : 'password'}
                    bind:value={smtpForm.smtpPass}
                    disabled={!canManage}
                    placeholder="••••••••"
                    class="rounded-xl pr-10"
                  />
                  {#if smtpForm.smtpPass}
                    <button
                      type="button"
                      onclick={() => (showSmtpPass = !showSmtpPass)}
                      class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                    >
                      <iconify-icon
                        icon={showSmtpPass ? 'solar:eye-bold' : 'solar:eye-closed-bold'}
                        width="20"
                      ></iconify-icon>
                    </button>
                  {/if}
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-2">
                <label for="smtpFromName" class="text-sm font-bold text-neutral-700 block">Nom de l'expéditeur</label>
                <Input
                  id="smtpFromName"
                  bind:value={smtpForm.smtpFromName}
                  disabled={!canManage}
                  placeholder="Votre Équipe"
                  class="rounded-xl"
                />
              </div>
              <div class="space-y-2">
                <label for="smtpFromEmail" class="text-sm font-bold text-neutral-700 block">Email de l'expéditeur</label>
                <Input
                  id="smtpFromEmail"
                  type="email"
                  bind:value={smtpForm.smtpFromEmail}
                  disabled={!canManage}
                  placeholder="equipe@votredomain.com"
                  class="rounded-xl"
                />
              </div>
            </div>
          </div>

          {#if canManage}
            <div class="flex flex-col md:flex-row gap-3 justify-end pt-8 mt-8 border-t border-neutral-100">
              <Button
                onclick={handleTestSmtp}
                disabled={testingSmtp || saving}
                intent="secondary"
                class="min-w-[220px]"
              >
                {#if testingSmtp}
                  <Spinner size="sm" />
                  <span>Test en cours...</span>
                {:else}
                  <iconify-icon icon="solar:test-tube-bold" width="18"></iconify-icon>
                  <span>Tester la configuration</span>
                {/if}
              </Button>
              <Button
                onclick={handleUpdateSmtp}
                disabled={saving || !hasSmtpChanges}
                class="px-6 bg-black text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {#if saving}
                  <Spinner size="sm" />
                  <span>Enregistrement...</span>
                {:else}
                  <iconify-icon icon="solar:diskette-bold" width="18"></iconify-icon>
                  <span>Enregistrer</span>
                {/if}
              </Button>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</div>

{#if deleteModalOpen}
  <div
    transition:fade={{ duration: 150 }}
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm"
  >
    <div class="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl space-y-6">
      <div class="space-y-2 text-center">
        <div class="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-500 mb-4">
          <iconify-icon icon="solar:bomb-bold-duotone" width="32"></iconify-icon>
        </div>
        <h3 class="text-2xl font-black tracking-tight text-neutral-900">Supprimer l'équipe ?</h3>
        <p class="text-neutral-500 font-medium">
          Cette action est définitive. Toutes les données de l'équipe seront supprimées.
        </p>
      </div>

      <div class="bg-neutral-50 p-4 rounded-2xl border border-neutral-200">
        <label for="deleteConfirm" class="text-xs font-bold text-neutral-500 uppercase tracking-wide block mb-2">
          Tapez "DELETE" pour confirmer
        </label>
        <input
          id="deleteConfirm"
          type="text"
          bind:value={deleteConfirmationText}
          placeholder="DELETE"
          class="w-full text-center font-black tracking-widest p-3 rounded-xl border-neutral-300 focus:border-red-500 focus:ring-red-500/20 uppercase"
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <button
          onclick={() => (deleteModalOpen = false)}
          class="px-4 py-3 rounded-xl font-bold bg-neutral-100 hover:bg-neutral-200 text-neutral-900 transition-colors"
        >
          Annuler
        </button>
        <button
          onclick={handleDeleteTeam}
          disabled={deleteConfirmationText !== 'DELETE' || deleting}
          class="px-4 py-3 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {deleting ? 'Suppression...' : 'Confirmer'}
        </button>
      </div>
    </div>
  </div>
{/if}
