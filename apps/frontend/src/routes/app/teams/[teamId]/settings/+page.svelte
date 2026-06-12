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

  let smtpForm = $state({
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    smtpFromName: '',
    smtpFromEmail: '',
  });

  let showSmtpPass = $state(false);

  let originalGeneralForm = $state({ name: '', description: '' });
  let originalSmtpForm = $state({ ...smtpForm });

  let hasGeneralChanges = $derived(
    generalForm.name !== originalGeneralForm.name ||
    generalForm.description !== originalGeneralForm.description
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
        await loadSmtpConfig();
      }
    } catch (error: any) {
      console.error('Error loading team:', error);
      toast.push(error?.message || 'Échec du chargement de l\'équipe', 'error');
      goto('/app/teams');
    } finally{
      loading = false;
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
      toast.push(result.message, 'success');
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
    { id: 'general', name: 'Général', icon: 'solar:settings-linear' },
    { id: 'smtp', name: 'SMTP', icon: 'solar:letter-linear' },
  ];
</script>

<div class="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
  {#if loading}
    <div class="flex items-center justify-center py-16">
      <Spinner size="lg" />
    </div>
  {:else if team}
    <div class="flex items-center gap-3">
      <button
        aria-label="Retour"
        onclick={handleBack}
        class="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted"
      >
        <iconify-icon icon="solar:arrow-left-linear" width="16"></iconify-icon>
      </button>
      <div class="space-y-1">
        <h1 class="text-2xl font-bold tracking-tight text-foreground">
          Paramètres de {team.name}
        </h1>
        <p class="text-sm text-muted-foreground">
          Gérez les paramètres de votre équipe
        </p>
      </div>
    </div>

    {#if !loading && !canManage}
      <Alert variant="warning">
        Vous n'avez pas les permissions nécessaires pour modifier ces paramètres. Contactez un administrateur.
      </Alert>
    {/if}

    <div class="rounded-xl border border-border bg-card p-1">
      <div class="grid grid-cols-2 gap-1">
        {#each tabs as tab (tab.id)}
          <button
            onclick={() => (activeTab = tab.id)}
            class="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors
            {activeTab === tab.id
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
          >
            <iconify-icon icon={tab.icon} width="16"></iconify-icon>
            {tab.name}
          </button>
        {/each}
      </div>
    </div>

    {#if activeTab === 'general'}
      <div in:fade={{ duration: 200 }} class="space-y-6">
        <div class="rounded-xl border border-border bg-card p-6">
          <div class="mb-6">
            <h2 class="text-lg font-semibold text-foreground">Informations générales</h2>
            <p class="text-sm text-muted-foreground mt-1">Modifiez les informations de base de votre équipe</p>
          </div>

          <div class="space-y-4">
            <div class="space-y-1.5">
              <label for="name" class="text-sm font-medium text-foreground block">
                Nom de l'équipe
              </label>
              <Input
                id="name"
                bind:value={generalForm.name}
                disabled={!canManage}
                placeholder="Équipe Marketing"
              />
            </div>

            <div class="space-y-1.5">
              <label for="description" class="text-sm font-medium text-foreground block">
                Description
              </label>
              <textarea
                id="description"
                bind:value={generalForm.description}
                disabled={!canManage}
                placeholder="Décrivez l'objectif de cette équipe..."
                rows="4"
                class="w-full min-h-24 rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none disabled:opacity-50 disabled:cursor-not-allowed"
              ></textarea>
            </div>
          </div>

          {#if canManage}
            <div class="flex justify-end pt-6 mt-6 border-t border-border">
              <button
                onclick={handleUpdateGeneral}
                disabled={saving || !hasGeneralChanges}
                class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50"
              >
                {#if saving}
                  <Spinner size="sm" />
                  <span>Enregistrement...</span>
                {:else}
                  <iconify-icon icon="solar:diskette-linear" width="16"></iconify-icon>
                  <span>Enregistrer</span>
                {/if}
              </button>
            </div>
          {/if}
        </div>

        {#if isOwner}
          <div class="rounded-xl border border-border bg-card p-6">
            <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h3 class="text-lg font-semibold text-foreground flex items-center gap-2">
                  <iconify-icon icon="solar:danger-triangle-linear" width="18"></iconify-icon>
                  Zone de danger
                </h3>
                <p class="text-sm text-muted-foreground mt-1 max-w-md">
                  La suppression de cette équipe est définitive. Toutes les données associées seront effacées immédiatement.
                </p>
              </div>
              <button
                onclick={() => { deleteModalOpen = true; deleteConfirmationText = ''; }}
                class="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
              >
                <iconify-icon icon="solar:trash-bin-trash-linear" width="16"></iconify-icon>
                Supprimer l'équipe
              </button>
            </div>
          </div>
        {/if}
      </div>
    {:else if activeTab === 'smtp'}
      <div in:fade={{ duration: 200 }}>
        <div class="rounded-xl border border-border bg-card p-6">
          <div class="mb-6">
            <h2 class="text-lg font-semibold text-foreground">Configuration SMTP</h2>
            <p class="text-sm text-muted-foreground mt-1">Configurez le serveur SMTP pour l'envoi d'emails de l'équipe</p>
          </div>

          <div class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label for="smtpHost" class="text-sm font-medium text-foreground block">Hôte SMTP</label>
                <Input
                  id="smtpHost"
                  bind:value={smtpForm.smtpHost}
                  disabled={!canManage}
                  placeholder="smtp.gmail.com"
                />
              </div>
              <div class="space-y-1.5">
                <label for="smtpPort" class="text-sm font-medium text-foreground block">Port SMTP</label>
                <Input
                  id="smtpPort"
                  type="number"
                  bind:value={smtpForm.smtpPort}
                  disabled={!canManage}
                  placeholder="587"
                />
              </div>
            </div>

            <div class="space-y-1.5">
              <label class="text-sm font-medium text-foreground flex items-center gap-2">
                <Toggle bind:checked={smtpForm.smtpSecure} disabled={!canManage} />
                Utiliser SSL/TLS (port 465)
              </label>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label for="smtpUser" class="text-sm font-medium text-foreground block">Nom d'utilisateur</label>
                <Input
                  id="smtpUser"
                  bind:value={smtpForm.smtpUser}
                  disabled={!canManage}
                  placeholder="votre@email.com"
                />
              </div>
              <div class="space-y-1.5">
                <label for="smtpPass" class="text-sm font-medium text-foreground block">Mot de passe</label>
                <div class="relative">
                  <Input
                    id="smtpPass"
                    type={showSmtpPass ? 'text' : 'password'}
                    bind:value={smtpForm.smtpPass}
                    disabled={!canManage}
                    placeholder="••••••••"
                    class="pr-10"
                  />
                  {#if smtpForm.smtpPass}
                    <button
                      type="button"
                      aria-label="Afficher ou masquer le mot de passe SMTP"
                      onclick={() => (showSmtpPass = !showSmtpPass)}
                      class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <iconify-icon
                        icon={showSmtpPass ? 'solar:eye-linear' : 'solar:eye-closed-linear'}
                        width="16"
                      ></iconify-icon>
                    </button>
                  {/if}
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label for="smtpFromName" class="text-sm font-medium text-foreground block">Nom de l'expéditeur</label>
                <Input
                  id="smtpFromName"
                  bind:value={smtpForm.smtpFromName}
                  disabled={!canManage}
                  placeholder="Votre Équipe"
                />
              </div>
              <div class="space-y-1.5">
                <label for="smtpFromEmail" class="text-sm font-medium text-foreground block">Email de l'expéditeur</label>
                <Input
                  id="smtpFromEmail"
                  type="email"
                  bind:value={smtpForm.smtpFromEmail}
                  disabled={!canManage}
                  placeholder="equipe@votredomain.com"
                />
              </div>
            </div>
          </div>

          {#if canManage}
            <div class="flex flex-col md:flex-row gap-2 justify-end pt-6 mt-6 border-t border-border">
              <button
                onclick={handleTestSmtp}
                disabled={testingSmtp || saving}
                class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                {#if testingSmtp}
                  <Spinner size="sm" />
                  <span>Test en cours...</span>
                {:else}
                  <iconify-icon icon="solar:test-tube-linear" width="16"></iconify-icon>
                  <span>Tester la configuration</span>
                {/if}
              </button>
              <button
                onclick={handleUpdateSmtp}
                disabled={saving || !hasSmtpChanges}
                class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50"
              >
                {#if saving}
                  <Spinner size="sm" />
                  <span>Enregistrement...</span>
                {:else}
                  <iconify-icon icon="solar:diskette-linear" width="16"></iconify-icon>
                  <span>Enregistrer</span>
                {/if}
              </button>
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
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
  >
    <div class="rounded-xl border border-border bg-card p-6 max-w-md w-full space-y-4">
      <div class="space-y-1">
        <h3 class="text-lg font-semibold text-foreground">Supprimer l'équipe ?</h3>
        <p class="text-sm text-muted-foreground">
          Cette action est définitive. Toutes les données de l'équipe seront supprimées.
        </p>
      </div>

      <div class="space-y-1.5">
        <label for="deleteConfirm" class="text-sm font-medium text-foreground block">
          Tapez "DELETE" pour confirmer
        </label>
        <input
          id="deleteConfirm"
          type="text"
          bind:value={deleteConfirmationText}
          placeholder="DELETE"
          class="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
        />
      </div>

      <div class="flex items-center justify-end gap-2">
        <button
          onclick={() => (deleteModalOpen = false)}
          class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
        >
          Annuler
        </button>
        <button
          onclick={handleDeleteTeam}
          disabled={deleteConfirmationText !== 'DELETE' || deleting}
          class="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
        >
          {deleting ? 'Suppression...' : 'Confirmer'}
        </button>
      </div>
    </div>
  </div>
{/if}
