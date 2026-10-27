<script lang="ts">
  import authStore from '$lib/auth-store';
  import { trpc } from '$lib/trpc';
  import {
    Alert,
    Button,
    Field,
    Icon,
    Input,
    Modal,
    PageHeader,
    SettingsRow,
    SettingsSection,
    Switch,
    Tabs,
    icons,
    toast,
  } from '@facile/muse';
  import { logger } from '@repo/logger';
  import type { SessionUser } from '@repo/auth-shared';
  import { onMount } from 'svelte';
  import { fade, slide } from 'svelte/transition';

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
    { id: 'profile', label: 'Profil', icon: icons.userCircle },
    { id: 'account', label: 'Compte', icon: icons.shield },
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
      toast.success('Profil mis à jour avec succès !');


      setTimeout(() => {
        showSavedMessage = false;
      }, 3000);
    } catch (error: any) {
      const errorMessage = error?.message || 'Échec de la mise à jour du profil';
      console.error('Failed to update profile:', error);
      toast.danger(errorMessage);
      message = { type: 'error', text: errorMessage };
    } finally {
      saving = false;
    }
  }



  async function handleChangePassword() {


    if (formData.newPassword !== formData.confirmPassword) {
      toast.danger('Les mots de passe ne correspondent pas');
      message = { type: 'error', text: 'Les mots de passe ne correspondent pas' };
      return;
    }


    if (formData.newPassword.length < 8) {
      toast.danger('Le mot de passe doit contenir au moins 8 caractères');
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
      toast.success('Mot de passe modifié avec succès !');
      message = { type: 'success', text: 'Mot de passe modifié avec succès !' };
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to change password';
      console.error('Failed to change password:', error);
      toast.danger(errorMessage);
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
      toast.danger('Veuillez remplir tous les champs SMTP');
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
      toast.success('Configuration SMTP valide !');
    } catch (error: any) {
      const errorMessage = error?.message || 'Configuration SMTP invalide';
      toast.danger(errorMessage);
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

      toast.success('Configuration SMTP enregistrée avec succès !');
    } catch (error: any) {
      const errorMessage = error?.message || 'Échec de la mise à jour de la config SMTP';
      console.error('Failed to update SMTP config:', error);
      toast.danger(errorMessage);
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
      toast.danger(errorMessage);
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

<div class="mx-auto flex w-full max-w-fc-lg flex-col gap-10">
  <PageHeader title="Paramètres" description="Gérez vos préférences de compte et la sécurité" />

  <Tabs items={tabs} value={activeTab} onChange={(id) => (activeTab = id)} label="Sections des paramètres" />

  {#if message}
    <div in:slide>
      <Alert tone={message.type === 'success' ? 'success' : 'danger'}>
        {message.text}
      </Alert>
    </div>
  {/if}

  {#if activeTab === 'profile'}
    <SettingsSection
      title="Informations personnelles"
      description="Mettez à jour vos informations de profil"
    >
      {#snippet actions()}
        {#if showSavedMessage}
          <span class="flex items-center gap-2 text-fc-sm text-fc-fg-muted" in:fade>
            <Icon icon={icons.check} size={16} />
            Modifications enregistrées
          </span>
        {/if}
        <Button
          icon={icons.check}
          onclick={handleUpdateProfile}
          disabled={saving || !hasProfileChanges}
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      {/snippet}

      <SettingsRow stacked>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Prénom" for="firstName">
            <Input id="firstName" bind:value={formData.firstName} placeholder="John" />
          </Field>
          <Field label="Nom de famille" for="lastName">
            <Input id="lastName" bind:value={formData.lastName} placeholder="Doe" />
          </Field>
        </div>
      </SettingsRow>

      <SettingsRow stacked>
        <Field label="Adresse e-mail" helper="Lecture seule" for="email">
          <Input id="email" value={formData.email} readonly disabled />
        </Field>
      </SettingsRow>
    </SettingsSection>
  {:else if activeTab === 'account'}
    <SettingsSection
      title="Sécurité"
      description="Mettez à jour votre mot de passe pour sécuriser votre compte"
    >
      {#snippet actions()}
        <Button icon={icons.check} onclick={handleChangePassword} disabled={saving}>
          {saving ? 'Mise à jour...' : 'Modifier le mot de passe'}
        </Button>
      {/snippet}

      <SettingsRow stacked>
        <Field label="Mot de passe actuel" for="currentPassword">
          <Input
            id="currentPassword"
            type="password"
            bind:value={formData.currentPassword}
            placeholder="••••••••"
          />
        </Field>
      </SettingsRow>

      <SettingsRow stacked>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nouveau mot de passe" for="newPassword">
            <Input
              id="newPassword"
              type="password"
              bind:value={formData.newPassword}
              placeholder="••••••••"
            />
          </Field>
          <Field label="Confirmer le mot de passe" for="confirmPassword">
            <Input
              id="confirmPassword"
              type="password"
              bind:value={formData.confirmPassword}
              placeholder="••••••••"
            />
          </Field>
        </div>
      </SettingsRow>
    </SettingsSection>

    <SettingsSection
      title="Serveur mail"
      description="Configurez votre serveur SMTP pour l'envoi d'emails de prospection"
    >
      {#snippet actions()}
        <Button
          variant="outline"
          onclick={handleTestSmtpConfig}
          disabled={testingSmtp || saving}
        >
          <iconify-icon icon="solar:test-tube-linear" width="16" height="16" class="block"></iconify-icon>
          {testingSmtp ? 'Test en cours...' : 'Tester la configuration'}
        </Button>
        <Button
          icon={icons.check}
          onclick={handleUpdateSmtpConfig}
          disabled={saving || !hasSmtpConfigChanges}
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      {/snippet}

      <SettingsRow stacked>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Hôte SMTP" for="smtpHost">
            <Input
              id="smtpHost"
              type="text"
              bind:value={formData.smtpHost}
              placeholder="smtp.gmail.com"
            />
          </Field>
          <Field label="Port SMTP" for="smtpPort">
            <Input id="smtpPort" type="number" bind:value={formData.smtpPort} placeholder="587" />
          </Field>
        </div>
      </SettingsRow>

      <SettingsRow
        label="Utiliser SSL/TLS (port 465)"
        description="Activez cette option si vous utilisez le port 465 avec SSL/TLS"
      >
        <Switch bind:checked={formData.smtpSecure} aria-label="Utiliser SSL/TLS (port 465)" />
      </SettingsRow>

      <SettingsRow stacked>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nom d'utilisateur SMTP" for="smtpUser">
            <Input
              id="smtpUser"
              type="text"
              bind:value={formData.smtpUser}
              placeholder="votre@email.com"
            />
          </Field>
          <Field label="Mot de passe SMTP" for="smtpPass">
            <div class="relative">
              <Input
                id="smtpPass"
                type={showSmtpPass ? 'text' : 'password'}
                bind:value={formData.smtpPass}
                placeholder="••••••••"
                class="pr-12"
              />
              {#if formData.smtpPass}
                <button
                  type="button"
                  onclick={() => (showSmtpPass = !showSmtpPass)}
                  aria-label={showSmtpPass
                    ? 'Masquer le mot de passe SMTP'
                    : 'Afficher le mot de passe SMTP'}
                  aria-pressed={showSmtpPass}
                  class="absolute top-0 right-0 inline-flex size-11 items-center justify-center rounded-fc-md text-fc-fg-muted transition-colors hover:text-fc-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring"
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
              type="text"
              bind:value={formData.smtpFromName}
              placeholder="Votre Nom"
            />
          </Field>
          <Field label="Email de l'expéditeur" for="smtpFromEmail">
            <Input
              id="smtpFromEmail"
              type="email"
              bind:value={formData.smtpFromEmail}
              placeholder="votre@email.com"
            />
          </Field>
        </div>
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Session" description="Ce navigateur uniquement.">
      <SettingsRow label="Se déconnecter" description="Terminer votre session en cours">
        <Button variant="ghost-danger" icon={icons.logout} onclick={() => authStore.logout()}>
          Se déconnecter
        </Button>
      </SettingsRow>
    </SettingsSection>

    <SettingsSection title="Zone de danger" description="Ces actions sont irréversibles.">
      <SettingsRow
        label="Supprimer le compte"
        description="La suppression de votre compte est définitive. Toutes vos données seront effacées immédiatement et ne pourront pas être récupérées."
      >
        <Button variant="danger" icon={icons.remove} onclick={handleDeleteAccount} disabled={deleting}>
          {deleting ? 'Suppression...' : 'Supprimer le compte'}
        </Button>
      </SettingsRow>
    </SettingsSection>
  {/if}
</div>

<Modal bind:open={deleteModalOpen} title="Supprimer le compte ?" size="md">
  <p class="text-fc-sm text-fc-fg-muted">
    Cette action est définitive. Vos données seront supprimées de façon permanente.
  </p>

  <Field label={'Tapez "DELETE" pour confirmer'} for="deleteConfirm">
    <Input id="deleteConfirm" type="text" bind:value={deleteConfirmationText} placeholder="DELETE" />
  </Field>

  {#snippet footer()}
    <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="ghost" onclick={() => (deleteModalOpen = false)}>Annuler</Button>
      <Button
        variant="danger"
        onclick={confirmDeleteAccount}
        disabled={deleteConfirmationText !== 'DELETE' || deleting}
      >
        {deleting ? 'Suppression...' : 'Confirmer'}
      </Button>
    </div>
  {/snippet}
</Modal>
