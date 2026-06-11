<script lang="ts">
  import authStore from '$lib/auth-store';
  import { trpc } from '$lib/trpc';
  import { Button, Input, Spinner, Alert, Toggle } from '@repo/ui';
  import { toast } from '@repo/utils';
  import { logger } from '@repo/logger';
  import 'iconify-icon';
  import type { SessionUser } from '@repo/auth-shared';
  import { onMount } from 'svelte';
  import { fade, slide, scale } from 'svelte/transition';

  let activeTab = $state('profile');
  let saving = $state(false);
  let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);
  let showSavedMessage = $state(false);

  let deleting = $state(false);
  let deleteModalOpen = $state(false);
  let deleteConfirmationText = $state('');

  let formData = $state({
    firstName: $authStore.user?.firstName || '',
    lastName: $authStore.user?.lastName || '',
    email: $authStore.user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    smtpFromName: '',
    smtpFromEmail: '',
  });

  let existingSmtpConfig = $state({
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    smtpFromName: '',
    smtpFromEmail: '',
  });

  let showSmtpPass = $state(false);
  let testingSmtp = $state(false);

  let originalFormData = $state({
    firstName: $authStore.user?.firstName || '',
    lastName: $authStore.user?.lastName || '',
  });

  let hasProfileChanges = $derived(
    formData.firstName !== originalFormData.firstName ||
      formData.lastName !== originalFormData.lastName
  );

  let hasSmtpConfigChanges = $derived(
    formData.smtpHost !== existingSmtpConfig.smtpHost ||
      formData.smtpPort !== existingSmtpConfig.smtpPort ||
      formData.smtpSecure !== existingSmtpConfig.smtpSecure ||
      formData.smtpUser !== existingSmtpConfig.smtpUser ||
      formData.smtpPass !== existingSmtpConfig.smtpPass ||
      formData.smtpFromName !== existingSmtpConfig.smtpFromName ||
      formData.smtpFromEmail !== existingSmtpConfig.smtpFromEmail
  );

  const tabs = [
    { id: 'profile', name: 'Profil', icon: 'solar:user-linear' },
    { id: 'account', name: 'Compte', icon: 'solar:shield-user-linear' },
  ];



  async function handleUpdateProfile() {
    saving = true;
    message = null;
    showSavedMessage = false;
    try {
      const updatedUser = await trpc.user.updateProfile.mutate({
        firstName: formData.firstName,
        lastName: formData.lastName,
      });
      authStore.updateUser(updatedUser as SessionUser);
      originalFormData.firstName = formData.firstName;
      originalFormData.lastName = formData.lastName;
      showSavedMessage = true;
      toast.push('Profil mis à jour avec succès !', 'success');


      setTimeout(() => {
        showSavedMessage = false;
      }, 3000);
    } catch (error: any) {
      const errorMessage = error?.message || 'Échec de la mise à jour du profil';
      console.error('Failed to update profile:', error);
      toast.push(errorMessage, 'error');
      message = { type: 'error', text: errorMessage };
    } finally {
      saving = false;
    }
  }



  async function handleChangePassword() {


    if (formData.newPassword !== formData.confirmPassword) {
      toast.push('Les mots de passe ne correspondent pas', 'error');
      message = { type: 'error', text: 'Les mots de passe ne correspondent pas' };
      return;
    }


    if (formData.newPassword.length < 8) {
      toast.push('Le mot de passe doit contenir au moins 8 caractères', 'error');
      message = { type: 'error', text: 'Le mot de passe doit contenir au moins 8 caractères' };
      return;
    }
    saving = true;
    message = null;
    try {
      await trpc.user.changePassword.mutate({
        currentPassword: formData.currentPassword,
        newPassword: formData.newPassword,
      });
      formData.currentPassword = '';
      formData.newPassword = '';
      formData.confirmPassword = '';
      toast.push('Mot de passe modifié avec succès !', 'success');
      message = { type: 'success', text: 'Mot de passe modifié avec succès !' };
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to change password';
      console.error('Failed to change password:', error);
      toast.push(errorMessage, 'error');
      message = { type: 'error', text: errorMessage };
    } finally {
      saving = false;
    }
  }



  async function handleTestSmtpConfig() {
    if (
      !formData.smtpHost ||
      !formData.smtpPort ||
      !formData.smtpUser ||
      !formData.smtpPass ||
      !formData.smtpFromName ||
      !formData.smtpFromEmail
    ) {
      toast.push('Veuillez remplir tous les champs SMTP', 'error');
      return;
    }

    testingSmtp = true;
    try {
      await trpc.user.testSmtpConfig.mutate({
        smtpHost: formData.smtpHost,
        smtpPort: formData.smtpPort,
        smtpSecure: formData.smtpSecure,
        smtpUser: formData.smtpUser,
        smtpPass: formData.smtpPass,
        smtpFromName: formData.smtpFromName,
        smtpFromEmail: formData.smtpFromEmail,
      });
      toast.push('Configuration SMTP valide !', 'success');
    } catch (error: any) {
      const errorMessage = error?.message || 'Configuration SMTP invalide';
      toast.push(errorMessage, 'error');
    } finally {
      testingSmtp = false;
    }
  }

  async function handleUpdateSmtpConfig() {
    saving = true;
    message = null;
    try {
      await trpc.user.updateSmtpConfig.mutate({
        smtpHost: formData.smtpHost || undefined,
        smtpPort: formData.smtpPort || undefined,
        smtpSecure: formData.smtpSecure,
        smtpUser: formData.smtpUser || undefined,
        smtpPass: formData.smtpPass || undefined,
        smtpFromName: formData.smtpFromName || undefined,
        smtpFromEmail: formData.smtpFromEmail || undefined,
      });

      const smtpConfig = await trpc.user.getSmtpConfig.query();
      existingSmtpConfig.smtpHost = smtpConfig.smtpHost || '';
      existingSmtpConfig.smtpPort = smtpConfig.smtpPort || 587;
      existingSmtpConfig.smtpSecure = smtpConfig.smtpSecure || false;
      existingSmtpConfig.smtpUser = smtpConfig.smtpUser || '';
      existingSmtpConfig.smtpPass = smtpConfig.smtpPass || '';
      existingSmtpConfig.smtpFromName = smtpConfig.smtpFromName || '';
      existingSmtpConfig.smtpFromEmail = smtpConfig.smtpFromEmail || '';

      formData.smtpHost = smtpConfig.smtpHost || '';
      formData.smtpPort = smtpConfig.smtpPort || 587;
      formData.smtpSecure = smtpConfig.smtpSecure || false;
      formData.smtpUser = smtpConfig.smtpUser || '';
      formData.smtpPass = smtpConfig.smtpPass || '';
      formData.smtpFromName = smtpConfig.smtpFromName || '';
      formData.smtpFromEmail = smtpConfig.smtpFromEmail || '';

      toast.push('Configuration SMTP enregistrée avec succès !', 'success');
    } catch (error: any) {
      const errorMessage = error?.message || 'Échec de la mise à jour de la config SMTP';
      console.error('Failed to update SMTP config:', error);
      toast.push(errorMessage, 'error');
    } finally {
      saving = false;
    }
  }



  async function handleDeleteAccount() {
    deleteModalOpen = true;
    deleteConfirmationText = '';
  }



  async function confirmDeleteAccount() {


    if (deleteConfirmationText !== 'DELETE') return;

    deleting = true;
    message = null;
    try {
      await trpc.user.deleteOwnAccount.mutate();
      authStore.logout();
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to delete account';
      logger.error({ err }, 'Failed to delete account');
      toast.push(errorMessage, 'error');
      message = { type: 'error', text: errorMessage };
      deleteModalOpen = false;
    } finally {
      deleting = false;
    }
  }



  onMount(async () => {
    const [smtpConfigResult] = await Promise.allSettled([
      trpc.user.getSmtpConfig.query(),
    ]);

    if (smtpConfigResult.status === 'fulfilled') {
      const smtpConfig = smtpConfigResult.value;
      existingSmtpConfig.smtpHost = smtpConfig.smtpHost || '';
      existingSmtpConfig.smtpPort = smtpConfig.smtpPort || 587;
      existingSmtpConfig.smtpSecure = smtpConfig.smtpSecure || false;
      existingSmtpConfig.smtpUser = smtpConfig.smtpUser || '';
      existingSmtpConfig.smtpPass = smtpConfig.smtpPass || '';
      existingSmtpConfig.smtpFromName = smtpConfig.smtpFromName || '';
      existingSmtpConfig.smtpFromEmail = smtpConfig.smtpFromEmail || '';

      formData.smtpHost = smtpConfig.smtpHost || '';
      formData.smtpPort = smtpConfig.smtpPort || 587;
      formData.smtpSecure = smtpConfig.smtpSecure || false;
      formData.smtpUser = smtpConfig.smtpUser || '';
      formData.smtpPass = smtpConfig.smtpPass || '';
      formData.smtpFromName = smtpConfig.smtpFromName || '';
      formData.smtpFromEmail = smtpConfig.smtpFromEmail || '';
    } else {
      console.error('Failed to fetch SMTP config:', smtpConfigResult.reason);
    }
  });
</script>

<div class="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
  <header class="space-y-1">
    <h1 class="text-2xl font-bold tracking-tight text-foreground">Paramètres</h1>
    <p class="text-sm text-muted-foreground">
      Gérez vos préférences de compte et la sécurité
    </p>
  </header>

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

  {#if message}
    <div in:slide>
      <Alert variant={message.type === 'success' ? 'success' : 'danger'}>
        {message.text}
      </Alert>
    </div>
  {/if}

  <div>
    {#if activeTab === 'profile'}
      <div in:fade={{ duration: 200 }} class="space-y-6">
        <div class="rounded-xl border border-border bg-card p-6">
          <div class="mb-6">
            <h2 class="text-lg font-semibold text-foreground">Informations personnelles</h2>
            <p class="text-sm text-muted-foreground mt-1">
              Mettez à jour vos informations de profil
            </p>
          </div>

          <div class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label for="firstName" class="text-sm font-medium text-foreground block">
                  Prénom
                </label>
                <Input
                  id="firstName"
                  bind:value={formData.firstName}
                  placeholder="John"
                />
              </div>
              <div class="space-y-1.5">
                <label for="lastName" class="text-sm font-medium text-foreground block">
                  Nom de famille
                </label>
                <Input
                  id="lastName"
                  bind:value={formData.lastName}
                  placeholder="Doe"
                />
              </div>
            </div>

            <div class="space-y-1.5">
              <label for="email" class="text-sm font-medium text-foreground flex items-center gap-2">
                Adresse e-mail
                <span class="text-xs text-muted-foreground">(lecture seule)</span>
              </label>
              <Input
                id="email"
                value={formData.email}
                disabled
              />
            </div>
          </div>

          <div class="pt-6 mt-6 flex items-center justify-between border-t border-border">
            {#if showSavedMessage}
              <span class="text-sm text-muted-foreground flex items-center gap-2" in:fade>
                <iconify-icon icon="solar:check-circle-linear" width="16"></iconify-icon>
                Modifications enregistrées
              </span>
            {:else}
              <div></div>
            {/if}
            <button
              onclick={handleUpdateProfile}
              disabled={saving || !hasProfileChanges}
              class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50"
            >
              {#if saving}
                <Spinner size="sm" />
              {:else}
                <iconify-icon icon="solar:diskette-linear" width="16"></iconify-icon>
              {/if}
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    {:else if activeTab === 'account'}
      <div in:fade={{ duration: 200 }} class="space-y-6">
        <div class="rounded-xl border border-border bg-card p-6">
          <div class="mb-6">
            <h2 class="text-lg font-semibold text-foreground">Sécurité</h2>
            <p class="text-sm text-muted-foreground mt-1">Mettez à jour votre mot de passe pour sécuriser votre compte</p>
          </div>

          <div class="space-y-4">
            <div class="space-y-1.5">
              <label for="currentPassword" class="text-sm font-medium text-foreground block">
                Mot de passe actuel
              </label>
              <Input
                id="currentPassword"
                type="password"
                bind:value={formData.currentPassword}
                placeholder="••••••••"
              />
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label for="newPassword" class="text-sm font-medium text-foreground block">
                  Nouveau mot de passe
                </label>
                <Input
                  id="newPassword"
                  type="password"
                  bind:value={formData.newPassword}
                  placeholder="••••••••"
                />
              </div>
              <div class="space-y-1.5">
                <label for="confirmPassword" class="text-sm font-medium text-foreground block">
                  Confirmer le mot de passe
                </label>
                <Input
                  id="confirmPassword"
                  type="password"
                  bind:value={formData.confirmPassword}
                  placeholder="••••••••"
                />
              </div>
            </div>
          </div>

          <div class="flex justify-end pt-6 mt-6 border-t border-border">
            <button
              onclick={handleChangePassword}
              disabled={saving}
              class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50"
            >
              {#if saving}
                <Spinner size="sm" />
              {:else}
                <iconify-icon icon="solar:diskette-linear" width="16"></iconify-icon>
              {/if}
              {saving ? 'Mise à jour...' : 'Modifier le mot de passe'}
            </button>
          </div>
        </div>

        <div class="rounded-xl border border-border bg-card p-6">
          <div class="mb-6">
            <h2 class="text-lg font-semibold text-foreground">Serveur Mail</h2>
            <p class="text-sm text-muted-foreground mt-1">
              Configurez votre serveur SMTP pour l'envoi d'emails de prospection
            </p>
          </div>

          <div class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label for="smtpHost" class="text-sm font-medium text-foreground block">
                  Hôte SMTP
                </label>
                <Input
                  id="smtpHost"
                  type="text"
                  bind:value={formData.smtpHost}
                  placeholder="smtp.gmail.com"
                />
              </div>
              <div class="space-y-1.5">
                <label for="smtpPort" class="text-sm font-medium text-foreground block">
                  Port SMTP
                </label>
                <Input
                  id="smtpPort"
                  type="number"
                  bind:value={formData.smtpPort}
                  placeholder="587"
                />
              </div>
            </div>

            <div class="space-y-1.5">
              <label class="text-sm font-medium text-foreground flex items-center gap-2">
                <Toggle bind:checked={formData.smtpSecure} />
                Utiliser SSL/TLS (port 465)
              </label>
              <p class="text-xs text-muted-foreground">
                Activez cette option si vous utilisez le port 465 avec SSL/TLS
              </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label for="smtpUser" class="text-sm font-medium text-foreground block">
                  Nom d'utilisateur SMTP
                </label>
                <Input
                  id="smtpUser"
                  type="text"
                  bind:value={formData.smtpUser}
                  placeholder="votre@email.com"
                />
              </div>
              <div class="space-y-1.5">
                <label for="smtpPass" class="text-sm font-medium text-foreground block">
                  Mot de passe SMTP
                </label>
                <div class="relative">
                  <Input
                    id="smtpPass"
                    type={showSmtpPass ? 'text' : 'password'}
                    bind:value={formData.smtpPass}
                    placeholder="••••••••"
                    class="pr-10"
                  />
                  {#if formData.smtpPass}
                    <button
                      type="button"
                      onclick={() => (showSmtpPass = !showSmtpPass)}
                      aria-label={showSmtpPass
                        ? 'Masquer le mot de passe SMTP'
                        : 'Afficher le mot de passe SMTP'}
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
                <label for="smtpFromName" class="text-sm font-medium text-foreground block">
                  Nom de l'expéditeur
                </label>
                <Input
                  id="smtpFromName"
                  type="text"
                  bind:value={formData.smtpFromName}
                  placeholder="Votre Nom"
                />
              </div>
              <div class="space-y-1.5">
                <label for="smtpFromEmail" class="text-sm font-medium text-foreground block">
                  Email de l'expéditeur
                </label>
                <Input
                  id="smtpFromEmail"
                  type="email"
                  bind:value={formData.smtpFromEmail}
                  placeholder="votre@email.com"
                />
              </div>
            </div>
          </div>

          <div class="flex flex-col md:flex-row gap-2 justify-end pt-6 mt-6 border-t border-border">
            <button
              onclick={handleTestSmtpConfig}
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
              onclick={handleUpdateSmtpConfig}
              disabled={saving || !hasSmtpConfigChanges}
              class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50"
            >
              {#if saving}
                <Spinner size="sm" />
              {:else}
                <iconify-icon icon="solar:diskette-linear" width="16"></iconify-icon>
              {/if}
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>

        <div class="rounded-xl border border-border bg-card p-6">
          <div class="mb-6">
            <h2 class="text-lg font-semibold text-foreground">Session</h2>
            <p class="text-sm text-muted-foreground mt-1">Terminer votre session en cours</p>
          </div>

          <div class="flex justify-end">
            <button
              onclick={() => authStore.logout()}
              class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              <iconify-icon icon="solar:logout-2-linear" width="16"></iconify-icon>
              Se déconnecter
            </button>
          </div>
        </div>

        <div class="rounded-xl border border-border bg-card p-6">
          <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 class="text-lg font-semibold text-foreground flex items-center gap-2">
                <iconify-icon icon="solar:danger-triangle-linear" width="18"></iconify-icon>
                Zone de danger
              </h3>
              <p class="text-sm text-muted-foreground mt-1 max-w-md">
                La suppression de votre compte est définitive. Toutes vos données seront effacées immédiatement et ne pourront pas être récupérées.
              </p>
            </div>
            <button
              onclick={handleDeleteAccount}
              disabled={deleting}
              class="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50 flex-shrink-0"
            >
              <iconify-icon icon="solar:trash-bin-trash-linear" width="16"></iconify-icon>
              {deleting ? 'Suppression...' : 'Supprimer le compte'}
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

{#if deleteModalOpen}
  <div
    transition:fade={{ duration: 150 }}
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
  >
    <div
      in:scale={{ start: 0.95, duration: 200 }}
      class="rounded-xl border border-border bg-card p-6 max-w-md w-full space-y-4"
    >
      <div class="space-y-1">
        <h3 class="text-lg font-semibold text-foreground">Supprimer le compte ?</h3>
        <p class="text-sm text-muted-foreground">
          Cette action est définitive. Vos données seront supprimées de façon permanente.
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
          onclick={confirmDeleteAccount}
          disabled={deleteConfirmationText !== 'DELETE' || deleting}
          class="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
        >
          {deleting ? 'Suppression...' : 'Confirmer'}
        </button>
      </div>
    </div>
  </div>
{/if}
