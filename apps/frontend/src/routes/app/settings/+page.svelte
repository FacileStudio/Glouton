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
    hunterApiKey: '',
    googleMapsApiKey: '',
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    smtpFromName: '',
    smtpFromEmail: '',
  });

  let existingApiKeys = $state({
    hunterApiKey: '',
    googleMapsApiKey: '',
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

  let showApiKeys = $state({
    hunterApiKey: false,
    googleMapsApiKey: false,
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

  let hasApiKeyChanges = $derived(
    formData.hunterApiKey !== existingApiKeys.hunterApiKey ||
    formData.googleMapsApiKey !== existingApiKeys.googleMapsApiKey
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
    { id: 'profile', name: 'Profil', icon: 'solar:user-bold' },
    { id: 'account', name: 'Compte', icon: 'solar:shield-user-bold' },
  ];

  let keywordsInput = $state('');
  let excludeKeywordsInput = $state('');
  let testingWebhook = $state(false);

  

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

  

  async function handleUpdateApiKeys() {
    saving = true;
    message = null;
    try {
      const updatePayload: any = {};
      if (formData.hunterApiKey && formData.hunterApiKey.trim())
        updatePayload.hunterApiKey = formData.hunterApiKey.trim();
      if (formData.googleMapsApiKey && formData.googleMapsApiKey.trim())
        updatePayload.googleMapsApiKey = formData.googleMapsApiKey.trim();

      await trpc.user.updateApiKeys.mutate(updatePayload);

      const user = await trpc.user.me.query();
      existingApiKeys.hunterApiKey = user.hunterApiKey || '';
      formData.hunterApiKey = user.hunterApiKey || '';
      existingApiKeys.googleMapsApiKey = user.googleMapsApiKey || '';
      formData.googleMapsApiKey = user.googleMapsApiKey || '';

      toast.push('API keys updated successfully!', 'success');
      message = { type: 'success', text: 'API keys updated successfully!' };
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to update API keys';
      console.error('Failed to update API keys:', error);
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
    const [userResult, smtpConfigResult] = await Promise.allSettled([
      trpc.user.me.query(),
      trpc.user.getSmtpConfig.query(),
    ]);

    

    if (userResult.status === 'fulfilled') {
      const user = userResult.value;
      existingApiKeys.hunterApiKey = user.hunterApiKey || '';
      formData.hunterApiKey = user.hunterApiKey || '';
      existingApiKeys.googleMapsApiKey = user.googleMapsApiKey || '';
      formData.googleMapsApiKey = user.googleMapsApiKey || '';
    } else {
      console.error('Failed to fetch API key status:', userResult.reason);
    }

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

<div
  class="min-h-screen p-6 lg:p-12 max-w-6xl mx-auto space-y-8 pb-32"
  style="background-color: #FAF7F5;"
>
  <header class="space-y-6">
    <div class="flex items-center gap-4">
      <div class="w-16 h-16 flex items-center justify-center bg-neutral-900 rounded-2xl">
        <iconify-icon icon="solar:settings-bold" width="32" class="text-white"></iconify-icon>
      </div>
      <div>
        <h1 class="text-3xl md:text-4xl font-black tracking-tight" style="color: #291334;">
          Paramètres
        </h1>
        <p class="text-neutral-500 font-medium text-base mt-1">
          Gérez vos préférences de compte et la sécurité
        </p>
      </div>
    </div>
  </header>

  <div class="rounded-2xl shadow-lg p-2" style="background-color: #EFEAE6;">
    <div class="grid grid-cols-2 gap-2">
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

  {#if message}
    <div in:slide class="max-w-xl mx-auto">
      <Alert variant={message.type === 'success' ? 'success' : 'danger'}>
        {message.text}
      </Alert>
    </div>
  {/if}

  <div>
    {#if activeTab === 'profile'}
      <div in:fade={{ duration: 300 }} class="space-y-6">
        <div class="p-8 md:p-10 rounded-2xl shadow-lg" style="background-color: #EFEAE6;">
          <div class="mb-8">
            <h2 class="text-2xl font-black mb-2" style="color: #291334;">Informations personnelles</h2>
            <p class="text-neutral-500 text-sm">
              Mettez à jour vos informations de profil
            </p>
          </div>

          <div class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-2">
                <label for="firstName" class="text-sm font-bold text-neutral-700 block"
                  >Prénom</label
                >
                <Input
                  id="firstName"
                  bind:value={formData.firstName}
                  placeholder="John"
                  class="rounded-xl border-neutral-200 focus:border-neutral-900 transition-colors"
                />
              </div>
              <div class="space-y-2">
                <label for="lastName" class="text-sm font-bold text-neutral-700 block"
                  >Nom de famille</label
                >
                <Input
                  id="lastName"
                  bind:value={formData.lastName}
                  placeholder="Doe"
                  class="rounded-xl border-neutral-200 focus:border-neutral-900 transition-colors"
                />
              </div>
            </div>

            <div class="space-y-2">
              <label for="email" class="text-sm font-bold text-neutral-700 flex items-center gap-2">
                Adresse e-mail
                <span class="text-xs text-neutral-400 font-medium">(lecture seule)</span>
              </label>
              <Input
                id="email"
                value={formData.email}
                disabled
                class="bg-neutral-50 border-neutral-200 text-neutral-600 cursor-not-allowed rounded-xl"
              />
            </div>
          </div>

          <div class="pt-8 mt-8 flex items-center justify-between border-t border-neutral-100">
            {#if showSavedMessage}
              <span class="text-sm font-bold text-green-600 flex items-center gap-2" in:fade>
                <iconify-icon icon="solar:check-circle-bold" width="18"></iconify-icon> Modifications enregistrées
              </span>
            {:else}
              <div></div>
            {/if}
            <Button
              onclick={handleUpdateProfile}
              disabled={saving || !hasProfileChanges}
              class="px-6 bg-black text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {#if saving}
                <Spinner size="sm" class="text-white" />
              {:else}
                <iconify-icon icon="solar:diskette-bold" width="18"></iconify-icon>
              {/if}
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </div>
    {:else if activeTab === 'account'}
      <div in:fade={{ duration: 300 }} class="space-y-6">
        <div class="p-8 md:p-10 rounded-2xl shadow-lg" style="background-color: #EFEAE6;">
          <div class="mb-8">
            <div class="flex items-center gap-3 mb-2">
              <div class="w-11 h-11 flex items-center justify-center bg-neutral-900 rounded-lg">
                <iconify-icon icon="solar:key-square-bold-duotone" width="20" class="text-white"
                ></iconify-icon>
              </div>
              <h2 class="text-2xl font-black" style="color: #291334;">Sécurité</h2>
            </div>
            <p class="text-neutral-500 text-sm">Mettez à jour votre mot de passe pour sécuriser votre compte</p>
          </div>

          <div class="space-y-6">
            <div class="space-y-2">
              <label for="currentPassword" class="text-sm font-bold text-neutral-700 block"
                >Mot de passe actuel</label
              >
              <Input
                id="currentPassword"
                type="password"
                bind:value={formData.currentPassword}
                placeholder="••••••••"
                class="rounded-xl"
              />
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-2">
                <label for="newPassword" class="text-sm font-bold text-neutral-700 block"
                  >Nouveau mot de passe</label
                >
                <Input
                  id="newPassword"
                  type="password"
                  bind:value={formData.newPassword}
                  placeholder="••••••••"
                  class="rounded-xl"
                />
              </div>
              <div class="space-y-2">
                <label for="confirmPassword" class="text-sm font-bold text-neutral-700 block"
                  >Confirmer le mot de passe</label
                >
                <Input
                  id="confirmPassword"
                  type="password"
                  bind:value={formData.confirmPassword}
                  placeholder="••••••••"
                  class="rounded-xl"
                />
              </div>
            </div>
          </div>

          <div class="flex justify-end pt-8 mt-8 border-t border-neutral-100">
            <Button
              onclick={handleChangePassword}
              disabled={saving}
              class="px-6 bg-black text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {#if saving}
                <Spinner size="sm" class="text-white" />
              {:else}
                <iconify-icon icon="solar:diskette-bold" width="18"></iconify-icon>
              {/if}
              {saving ? 'Mise à jour...' : 'Modifier le mot de passe'}
            </Button>
          </div>
        </div>

        <div class="p-8 md:p-10 rounded-2xl shadow-lg" style="background-color: #EFEAE6;">
          <div class="mb-8">
            <div class="flex items-center gap-3 mb-2">
              <div class="w-11 h-11 flex items-center justify-center bg-neutral-900 rounded-lg">
                <iconify-icon icon="solar:key-bold-duotone" width="20" class="text-white"
                ></iconify-icon>
              </div>
              <h2 class="text-2xl font-black" style="color: #291334;">Clés API sources</h2>
            </div>
            <p class="text-neutral-500 text-sm">Configurez les clés API pour les sources de leads</p>
          </div>

          <div class="space-y-6">
            <div class="grid grid-cols-1 gap-6">
              <div class="space-y-2">
                <label
                  for="hunterApiKey"
                  class="text-sm font-bold text-neutral-700 flex items-center gap-2"
                >
                  Hunter.io API Key
                  {#if existingApiKeys.hunterApiKey}
                    <span
                      class="text-xs font-bold text-green-600 flex items-center gap-1 px-2 py-0.5 bg-green-50 rounded-full"
                    >
                      <iconify-icon icon="solar:check-circle-bold" width="12"></iconify-icon>
                      Actif
                    </span>
                  {/if}
                </label>
                <div class="relative">
                  <Input
                    id="hunterApiKey"
                    type={showApiKeys.hunterApiKey ? 'text' : 'password'}
                    bind:value={formData.hunterApiKey}
                    placeholder="Entrez votre clé API Hunter.io"
                    class="rounded-xl font-mono pr-10"
                  />
                  {#if formData.hunterApiKey}
                    <button
                      type="button"
                      onclick={() => (showApiKeys.hunterApiKey = !showApiKeys.hunterApiKey)}
                      aria-label={showApiKeys.hunterApiKey
                        ? 'Masquer la clé API Hunter.io'
                        : 'Afficher la clé API Hunter.io'}
                      class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                    >
                      <iconify-icon
                        icon={showApiKeys.hunterApiKey ? 'solar:eye-bold' : 'solar:eye-closed-bold'}
                        width="20"
                      ></iconify-icon>
                    </button>
                  {/if}
                </div>
                <p class="text-xs text-neutral-500">
                  Get yours at <a
                    href="https://hunter.io/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="underline hover:text-neutral-900">hunter.io/api</a
                  >
                </p>
              </div>

              <div class="space-y-2">
                <label
                  for="googleMapsApiKey"
                  class="text-sm font-bold text-neutral-700 flex items-center gap-2"
                >
                  Google Maps API Key
                  {#if existingApiKeys.googleMapsApiKey}
                    <span
                      class="text-xs font-bold text-green-600 flex items-center gap-1 px-2 py-0.5 bg-green-50 rounded-full"
                    >
                      <iconify-icon icon="solar:check-circle-bold" width="12"></iconify-icon>
                      Actif
                    </span>
                  {/if}
                </label>
                <div class="relative">
                  <Input
                    id="googleMapsApiKey"
                    type={showApiKeys.googleMapsApiKey ? 'text' : 'password'}
                    bind:value={formData.googleMapsApiKey}
                    placeholder="Entrez votre clé API Google Maps"
                    class="rounded-xl font-mono pr-10"
                  />
                  {#if formData.googleMapsApiKey}
                    <button
                      type="button"
                      onclick={() => (showApiKeys.googleMapsApiKey = !showApiKeys.googleMapsApiKey)}
                      aria-label={showApiKeys.googleMapsApiKey
                        ? 'Masquer la clé API Google Maps'
                        : 'Afficher la clé API Google Maps'}
                      class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                    >
                      <iconify-icon
                        icon={showApiKeys.googleMapsApiKey ? 'solar:eye-bold' : 'solar:eye-closed-bold'}
                        width="20"
                      ></iconify-icon>
                    </button>
                  {/if}
                </div>
                <p class="text-xs text-neutral-500">
                  Utilisée pour les chasses locales. Get yours at <a
                    href="https://console.cloud.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="underline hover:text-neutral-900">console.cloud.google.com</a
                  >
                </p>
              </div>
            </div>
          </div>

          <div class="flex justify-end pt-8 mt-8 border-t border-neutral-100">
            <Button
              onclick={handleUpdateApiKeys}
              disabled={saving || !hasApiKeyChanges}
              class="px-6 bg-black text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {#if saving}
                <Spinner size="sm" class="text-white" />
              {:else}
                <iconify-icon icon="solar:diskette-bold" width="18"></iconify-icon>
              {/if}
              {saving ? 'Enregistrement...' : 'Enregistrer les clés API'}
            </Button>
          </div>
        </div>

        <div class="p-8 md:p-10 rounded-2xl shadow-lg" style="background-color: #EFEAE6;">
          <div class="mb-8">
            <div class="flex items-center gap-3 mb-2">
              <div class="w-11 h-11 flex items-center justify-center bg-neutral-900 rounded-lg">
                <iconify-icon icon="solar:letter-bold-duotone" width="20" class="text-white"
                ></iconify-icon>
              </div>
              <h2 class="text-2xl font-black" style="color: #291334;">Serveur Mail</h2>
            </div>
            <p class="text-neutral-500 text-sm">
              Configurez votre serveur SMTP pour l'envoi d'emails de prospection
            </p>
          </div>

          <div class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-2">
                <label for="smtpHost" class="text-sm font-bold text-neutral-700 block"
                  >Hôte SMTP</label
                >
                <Input
                  id="smtpHost"
                  type="text"
                  bind:value={formData.smtpHost}
                  placeholder="smtp.gmail.com"
                  class="rounded-xl"
                />
              </div>
              <div class="space-y-2">
                <label for="smtpPort" class="text-sm font-bold text-neutral-700 block"
                  >Port SMTP</label
                >
                <Input
                  id="smtpPort"
                  type="number"
                  bind:value={formData.smtpPort}
                  placeholder="587"
                  class="rounded-xl"
                />
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-bold text-neutral-700 flex items-center gap-2">
                <Toggle bind:checked={formData.smtpSecure} />
                Utiliser SSL/TLS (port 465)
              </label>
              <p class="text-xs text-neutral-500">
                Activez cette option si vous utilisez le port 465 avec SSL/TLS
              </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-2">
                <label for="smtpUser" class="text-sm font-bold text-neutral-700 block"
                  >Nom d'utilisateur SMTP</label
                >
                <Input
                  id="smtpUser"
                  type="text"
                  bind:value={formData.smtpUser}
                  placeholder="votre@email.com"
                  class="rounded-xl"
                />
              </div>
              <div class="space-y-2">
                <label for="smtpPass" class="text-sm font-bold text-neutral-700 block"
                  >Mot de passe SMTP</label
                >
                <div class="relative">
                  <Input
                    id="smtpPass"
                    type={showSmtpPass ? 'text' : 'password'}
                    bind:value={formData.smtpPass}
                    placeholder="••••••••"
                    class="rounded-xl pr-10"
                  />
                  {#if formData.smtpPass}
                    <button
                      type="button"
                      onclick={() => (showSmtpPass = !showSmtpPass)}
                      aria-label={showSmtpPass
                        ? 'Masquer le mot de passe SMTP'
                        : 'Afficher le mot de passe SMTP'}
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
                <label for="smtpFromName" class="text-sm font-bold text-neutral-700 block"
                  >Nom de l'expéditeur</label
                >
                <Input
                  id="smtpFromName"
                  type="text"
                  bind:value={formData.smtpFromName}
                  placeholder="Votre Nom"
                  class="rounded-xl"
                />
              </div>
              <div class="space-y-2">
                <label for="smtpFromEmail" class="text-sm font-bold text-neutral-700 block"
                  >Email de l'expéditeur</label
                >
                <Input
                  id="smtpFromEmail"
                  type="email"
                  bind:value={formData.smtpFromEmail}
                  placeholder="votre@email.com"
                  class="rounded-xl"
                />
              </div>
            </div>
          </div>

          <div
            class="flex flex-col md:flex-row gap-3 justify-end pt-8 mt-8 border-t border-neutral-100"
          >
            <Button
              onclick={handleTestSmtpConfig}
              disabled={testingSmtp || saving}
              class="px-6 bg-neutral-600 text-white hover:bg-neutral-700 disabled:opacity-50 min-w-[220px]"
            >
              {#if testingSmtp}
                <Spinner size="sm" class="text-white" />
                <span>Test en cours...</span>
              {:else}
                <iconify-icon icon="solar:test-tube-bold" width="18"></iconify-icon>
                <span>Tester la configuration</span>
              {/if}
            </Button>
            <Button
              onclick={handleUpdateSmtpConfig}
              disabled={saving || !hasSmtpConfigChanges}
              class="px-6 bg-black text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {#if saving}
                <Spinner size="sm" class="text-white" />
              {:else}
                <iconify-icon icon="solar:diskette-bold" width="18"></iconify-icon>
              {/if}
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </div>

        <div class="p-8 md:p-10 rounded-2xl shadow-lg" style="background-color: #EFEAE6;">
          <div class="mb-8">
            <div class="flex items-center gap-3 mb-2">
              <div class="w-11 h-11 flex items-center justify-center bg-neutral-900 rounded-lg">
                <iconify-icon icon="solar:logout-2-bold-duotone" width="20" class="text-white"
                ></iconify-icon>
              </div>
              <h2 class="text-2xl font-black" style="color: #291334;">Session</h2>
            </div>
            <p class="text-neutral-500 text-sm">Terminer votre session en cours</p>
          </div>

          <div class="flex justify-end">
            <Button
              onclick={() => authStore.logout()}
              class="px-6 bg-red-600 text-white hover:bg-red-700"
            >
              <iconify-icon icon="solar:logout-2-bold" width="18"></iconify-icon>
              Se déconnecter
            </Button>
          </div>
        </div>

        <div
          class="rounded-2xl border-2 border-red-200 shadow-lg p-8 md:p-10"
          style="background-color: #EFEAE6;"
        >
          <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h3 class="text-red-600 font-black text-xl mb-2 flex items-center gap-2">
                <iconify-icon icon="solar:danger-triangle-bold" width="24"></iconify-icon>
                Zone de danger
              </h3>
              <p class="text-neutral-600 text-sm leading-relaxed max-w-md">
                La suppression de votre compte est définitive. Toutes vos données seront effacées immédiatement et ne pourront pas être récupérées.
              </p>
            </div>
            <Button
              onclick={handleDeleteAccount}
              disabled={deleting}
              class="bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex-shrink-0"
            >
              <iconify-icon icon="solar:trash-bin-trash-bold" width="20"></iconify-icon>
              {deleting ? 'Suppression...' : 'Supprimer le compte'}
            </Button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

{#if deleteModalOpen}
  <div
    transition:fade={{ duration: 150 }}
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm"
  >
    <div
      in:scale={{ start: 0.95, duration: 200 }}
      class="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl space-y-6"
    >
      <div class="space-y-2 text-center">
        <div
          class="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-500 mb-4"
        >
          <iconify-icon icon="solar:bomb-bold-duotone" width="32"></iconify-icon>
        </div>
        <h3 class="text-2xl font-black tracking-tight text-neutral-900">Supprimer le compte ?</h3>
        <p class="text-neutral-500 font-medium">
          Cette action est définitive. Vos données seront supprimées de façon permanente.
        </p>
      </div>

      <div class="bg-neutral-50 p-4 rounded-2xl border border-neutral-200">
        <label
          for="deleteConfirm"
          class="text-xs font-bold text-neutral-500 uppercase tracking-wide block mb-2"
        >
          Type "DELETE" to confirm
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
          onclick={confirmDeleteAccount}
          disabled={deleteConfirmationText !== 'DELETE' || deleting}
          class="px-4 py-3 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {deleting ? 'Goodbye...' : 'Confirm Delete'}
        </button>
      </div>
    </div>
  </div>
{/if}
