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
    apolloApiKey: '',
    snovApiKey: '',
    hasdataApiKey: '',
    contactoutApiKey: '',
  });

  let existingApiKeys = $state({
    hunterApiKey: '',
    apolloApiKey: '',
    snovApiKey: '',
    hasdataApiKey: '',
    contactoutApiKey: '',
  });

  let showApiKeys = $state({
    hunterApiKey: false,
    apolloApiKey: false,
    snovApiKey: false,
    hasdataApiKey: false,
    contactoutApiKey: false,
  });

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
      formData.apolloApiKey !== existingApiKeys.apolloApiKey ||
      formData.snovApiKey !== existingApiKeys.snovApiKey ||
      formData.hasdataApiKey !== existingApiKeys.hasdataApiKey ||
      formData.contactoutApiKey !== existingApiKeys.contactoutApiKey
  );

  const tabs = [
    { id: 'profile', name: 'Profile', icon: 'solar:user-bold' },
    { id: 'account', name: 'Account', icon: 'solar:shield-user-bold' },
  ];

  let keywordsInput = $state('');
  let excludeKeywordsInput = $state('');
  let testingWebhook = $state(false);

  /**
   * handleUpdateProfile
   */
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
      toast.push('Profile updated successfully!', 'success');
      /**
       * setTimeout
       */
      setTimeout(() => {
        showSavedMessage = false;
      }, 3000);
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to update profile';
      console.error('Failed to update profile:', error);
      toast.push(errorMessage, 'error');
      message = { type: 'error', text: errorMessage };
    } finally {
      saving = false;
    }
  }

  /**
   * handleChangePassword
   */
  async function handleChangePassword() {
    /**
     * if
     */
    if (formData.newPassword !== formData.confirmPassword) {
      toast.push('Passwords do not match', 'error');
      message = { type: 'error', text: 'Passwords do not match' };
      return;
    }
    /**
     * if
     */
    if (formData.newPassword.length < 8) {
      toast.push('Password must be at least 8 characters', 'error');
      message = { type: 'error', text: 'Password must be at least 8 characters' };
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
      toast.push('Password changed successfully!', 'success');
      message = { type: 'success', text: 'Password changed successfully!' };
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to change password';
      console.error('Failed to change password:', error);
      toast.push(errorMessage, 'error');
      message = { type: 'error', text: errorMessage };
    } finally {
      saving = false;
    }
  }

  /**
   * handleUpdateApiKeys
   */
  async function handleUpdateApiKeys() {
    console.log('Form data:', formData);

    const hasAnyKey =
      formData.hunterApiKey ||
      formData.apolloApiKey ||
      formData.snovApiKey ||
      formData.hasdataApiKey ||
      formData.contactoutApiKey;

    const hasAnyExistingKey =
      existingApiKeys.hunterApiKey ||
      existingApiKeys.apolloApiKey ||
      existingApiKeys.snovApiKey ||
      existingApiKeys.hasdataApiKey ||
      existingApiKeys.contactoutApiKey;

    console.log('hasAnyKey:', hasAnyKey, 'hasAnyExistingKey:', hasAnyExistingKey);

    /**
     * if
     */
    if (!hasAnyKey && !hasAnyExistingKey) {
      toast.push('Please enter at least one API key', 'error');
      message = { type: 'error', text: 'Please enter at least one API key' };
      return;
    }

    saving = true;
    message = null;
    try {
      const updatePayload: any = {};

      /**
       * if
       */
      if (formData.hunterApiKey && formData.hunterApiKey.trim())
        updatePayload.hunterApiKey = formData.hunterApiKey.trim();
      /**
       * if
       */
      if (formData.apolloApiKey && formData.apolloApiKey.trim())
        updatePayload.apolloApiKey = formData.apolloApiKey.trim();
      /**
       * if
       */
      if (formData.snovApiKey && formData.snovApiKey.trim())
        updatePayload.snovApiKey = formData.snovApiKey.trim();
      /**
       * if
       */
      if (formData.hasdataApiKey && formData.hasdataApiKey.trim())
        updatePayload.hasdataApiKey = formData.hasdataApiKey.trim();
      /**
       * if
       */
      if (formData.contactoutApiKey && formData.contactoutApiKey.trim())
        updatePayload.contactoutApiKey = formData.contactoutApiKey.trim();

      console.log('Sending API key update:', updatePayload);
      await trpc.user.updateApiKeys.mutate(updatePayload);
      console.log('API keys updated successfully');

      const user = await trpc.user.me.query();
      existingApiKeys.hunterApiKey = user.hunterApiKey || '';
      existingApiKeys.apolloApiKey = user.apolloApiKey || '';
      existingApiKeys.snovApiKey = user.snovApiKey || '';
      existingApiKeys.hasdataApiKey = user.hasdataApiKey || '';
      existingApiKeys.contactoutApiKey = user.contactoutApiKey || '';

      formData.hunterApiKey = user.hunterApiKey || '';
      formData.apolloApiKey = user.apolloApiKey || '';
      formData.snovApiKey = user.snovApiKey || '';
      formData.hasdataApiKey = user.hasdataApiKey || '';
      formData.contactoutApiKey = user.contactoutApiKey || '';

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

  /**
   * handleDeleteAccount
   */
  async function handleDeleteAccount() {
    deleteModalOpen = true;
    deleteConfirmationText = '';
  }

  /**
   * confirmDeleteAccount
   */
  async function confirmDeleteAccount() {
    /**
     * if
     */
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

  /**
   * onMount
   */
  onMount(async () => {
    const [userResult] = await Promise.allSettled([trpc.user.me.query()]);

    /**
     * if
     */
    if (userResult.status === 'fulfilled') {
      const user = userResult.value;
      existingApiKeys.hunterApiKey = user.hunterApiKey || '';
      existingApiKeys.apolloApiKey = user.apolloApiKey || '';
      existingApiKeys.snovApiKey = user.snovApiKey || '';
      existingApiKeys.hasdataApiKey = user.hasdataApiKey || '';
      existingApiKeys.contactoutApiKey = user.contactoutApiKey || '';

      formData.hunterApiKey = user.hunterApiKey || '';
      formData.apolloApiKey = user.apolloApiKey || '';
      formData.snovApiKey = user.snovApiKey || '';
      formData.hasdataApiKey = user.hasdataApiKey || '';
      formData.contactoutApiKey = user.contactoutApiKey || '';
    } else {
      console.error('Failed to fetch API key status:', userResult.reason);
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
          Settings
        </h1>
        <p class="text-neutral-500 font-medium text-base mt-1">
          Manage your account preferences and security
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
            <h2 class="text-2xl font-black mb-2" style="color: #291334;">Personal Information</h2>
            <p class="text-neutral-500 text-sm">
              Update your profile details and contact information
            </p>
          </div>

          <div class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-2">
                <label for="firstName" class="text-sm font-bold text-neutral-700 block"
                  >First Name</label
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
                  >Last Name</label
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
                Email Address
                <span class="text-xs text-neutral-400 font-medium">(read-only)</span>
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
                <iconify-icon icon="solar:check-circle-bold" width="18"></iconify-icon> Changes saved
                successfully
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
              {saving ? 'Saving...' : 'Save Changes'}
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
              <h2 class="text-2xl font-black" style="color: #291334;">Security</h2>
            </div>
            <p class="text-neutral-500 text-sm">Update your password to keep your account secure</p>
          </div>

          <div class="space-y-6">
            <div class="space-y-2">
              <label for="currentPassword" class="text-sm font-bold text-neutral-700 block"
                >Current Password</label
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
                  >New Password</label
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
                  >Confirm Password</label
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
              {saving ? 'Updating...' : 'Update Password'}
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
              <h2 class="text-2xl font-black" style="color: #291334;">Lead Source API Keys</h2>
            </div>
            <p class="text-neutral-500 text-sm">Configure API keys for lead extraction sources</p>
          </div>

          <div class="space-y-6">
            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div class="flex gap-3">
                <iconify-icon
                  icon="solar:info-circle-bold"
                  width="20"
                  class="text-blue-600 flex-shrink-0 mt-0.5"
                ></iconify-icon>
                <div class="text-sm text-blue-800">
                  <p class="font-bold mb-1">Free tier available</p>
                  <p>
                    Most services offer free tiers. Enter the API keys you have and the system will
                    automatically use the best available source for each hunt.
                  </p>
                </div>
              </div>
            </div>

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
                      Active
                    </span>
                  {/if}
                </label>
                <div class="relative">
                  <Input
                    id="hunterApiKey"
                    type={showApiKeys.hunterApiKey ? 'text' : 'password'}
                    bind:value={formData.hunterApiKey}
                    placeholder="Enter your Hunter.io API key"
                    class="rounded-xl font-mono pr-10"
                  />
                  {#if formData.hunterApiKey}
                    <button
                      type="button"
                      onclick={() => (showApiKeys.hunterApiKey = !showApiKeys.hunterApiKey)}
                      aria-label={showApiKeys.hunterApiKey
                        ? 'Hide Hunter.io API key'
                        : 'Show Hunter.io API key'}
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
                  for="apolloApiKey"
                  class="text-sm font-bold text-neutral-700 flex items-center gap-2"
                >
                  Apollo.io API Key
                  {#if existingApiKeys.apolloApiKey}
                    <span
                      class="text-xs font-bold text-green-600 flex items-center gap-1 px-2 py-0.5 bg-green-50 rounded-full"
                    >
                      <iconify-icon icon="solar:check-circle-bold" width="12"></iconify-icon>
                      Active
                    </span>
                  {/if}
                </label>
                <div class="relative">
                  <Input
                    id="apolloApiKey"
                    type={showApiKeys.apolloApiKey ? 'text' : 'password'}
                    bind:value={formData.apolloApiKey}
                    placeholder="Enter your Apollo.io API key"
                    class="rounded-xl font-mono pr-10"
                  />
                  {#if formData.apolloApiKey}
                    <button
                      type="button"
                      onclick={() => (showApiKeys.apolloApiKey = !showApiKeys.apolloApiKey)}
                      aria-label={showApiKeys.apolloApiKey
                        ? 'Hide Apollo.io API key'
                        : 'Show Apollo.io API key'}
                      class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                    >
                      <iconify-icon
                        icon={showApiKeys.apolloApiKey ? 'solar:eye-bold' : 'solar:eye-closed-bold'}
                        width="20"
                      ></iconify-icon>
                    </button>
                  {/if}
                </div>
                <p class="text-xs text-neutral-500">
                  Get yours at <a
                    href="https://apollo.io/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="underline hover:text-neutral-900">apollo.io/api</a
                  >
                </p>
              </div>

              <div class="space-y-2">
                <label
                  for="snovApiKey"
                  class="text-sm font-bold text-neutral-700 flex items-center gap-2"
                >
                  Snov.io API Key
                  {#if existingApiKeys.snovApiKey}
                    <span
                      class="text-xs font-bold text-green-600 flex items-center gap-1 px-2 py-0.5 bg-green-50 rounded-full"
                    >
                      <iconify-icon icon="solar:check-circle-bold" width="12"></iconify-icon>
                      Active
                    </span>
                  {/if}
                </label>
                <div class="relative">
                  <Input
                    id="snovApiKey"
                    type={showApiKeys.snovApiKey ? 'text' : 'password'}
                    bind:value={formData.snovApiKey}
                    placeholder="Enter your Snov.io API key"
                    class="rounded-xl font-mono pr-10"
                  />
                  {#if formData.snovApiKey}
                    <button
                      type="button"
                      onclick={() => (showApiKeys.snovApiKey = !showApiKeys.snovApiKey)}
                      aria-label={showApiKeys.snovApiKey
                        ? 'Hide Snov.io API key'
                        : 'Show Snov.io API key'}
                      class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                    >
                      <iconify-icon
                        icon={showApiKeys.snovApiKey ? 'solar:eye-bold' : 'solar:eye-closed-bold'}
                        width="20"
                      ></iconify-icon>
                    </button>
                  {/if}
                </div>
                <p class="text-xs text-neutral-500">
                  Get yours at <a
                    href="https://snov.io/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="underline hover:text-neutral-900">snov.io/api</a
                  >
                </p>
              </div>

              <div class="space-y-2">
                <label
                  for="hasdataApiKey"
                  class="text-sm font-bold text-neutral-700 flex items-center gap-2"
                >
                  HasData API Key
                  {#if existingApiKeys.hasdataApiKey}
                    <span
                      class="text-xs font-bold text-green-600 flex items-center gap-1 px-2 py-0.5 bg-green-50 rounded-full"
                    >
                      <iconify-icon icon="solar:check-circle-bold" width="12"></iconify-icon>
                      Active
                    </span>
                  {/if}
                </label>
                <div class="relative">
                  <Input
                    id="hasdataApiKey"
                    type={showApiKeys.hasdataApiKey ? 'text' : 'password'}
                    bind:value={formData.hasdataApiKey}
                    placeholder="Enter your HasData API key"
                    class="rounded-xl font-mono pr-10"
                  />
                  {#if formData.hasdataApiKey}
                    <button
                      type="button"
                      onclick={() => (showApiKeys.hasdataApiKey = !showApiKeys.hasdataApiKey)}
                      aria-label={showApiKeys.hasdataApiKey
                        ? 'Hide HasData API key'
                        : 'Show HasData API key'}
                      class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                    >
                      <iconify-icon
                        icon={showApiKeys.hasdataApiKey
                          ? 'solar:eye-bold'
                          : 'solar:eye-closed-bold'}
                        width="20"
                      ></iconify-icon>
                    </button>
                  {/if}
                </div>
                <p class="text-xs text-neutral-500">
                  Get yours at <a
                    href="https://hasdata.com/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="underline hover:text-neutral-900">hasdata.com/api</a
                  >
                </p>
              </div>

              <div class="space-y-2">
                <label
                  for="contactoutApiKey"
                  class="text-sm font-bold text-neutral-700 flex items-center gap-2"
                >
                  ContactOut API Key
                  {#if existingApiKeys.contactoutApiKey}
                    <span
                      class="text-xs font-bold text-green-600 flex items-center gap-1 px-2 py-0.5 bg-green-50 rounded-full"
                    >
                      <iconify-icon icon="solar:check-circle-bold" width="12"></iconify-icon>
                      Active
                    </span>
                  {/if}
                </label>
                <div class="relative">
                  <Input
                    id="contactoutApiKey"
                    type={showApiKeys.contactoutApiKey ? 'text' : 'password'}
                    bind:value={formData.contactoutApiKey}
                    placeholder="Enter your ContactOut API key"
                    class="rounded-xl font-mono pr-10"
                  />
                  {#if formData.contactoutApiKey}
                    <button
                      type="button"
                      onclick={() => (showApiKeys.contactoutApiKey = !showApiKeys.contactoutApiKey)}
                      aria-label={showApiKeys.contactoutApiKey
                        ? 'Hide ContactOut API key'
                        : 'Show ContactOut API key'}
                      class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                    >
                      <iconify-icon
                        icon={showApiKeys.contactoutApiKey
                          ? 'solar:eye-bold'
                          : 'solar:eye-closed-bold'}
                        width="20"
                      ></iconify-icon>
                    </button>
                  {/if}
                </div>
                <p class="text-xs text-neutral-500">
                  Get yours at <a
                    href="https://contactout.com/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="underline hover:text-neutral-900">contactout.com/api</a
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
              {saving ? 'Saving...' : 'Save API Keys'}
            </Button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="p-8 rounded-2xl shadow-lg" style="background-color: #EFEAE6;">
            <div class="mb-6">
              <h3 class="font-black text-lg mb-1" style="color: #291334;">Session</h3>
              <p class="text-sm text-neutral-500">End your current session</p>
            </div>
            <Button
              onclick={() => authStore.logout()}
              class="bg-red-600 text-white hover:bg-red-700 w-full"
            >
              <iconify-icon icon="solar:logout-2-bold" width="20"></iconify-icon>
              Log Out
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
                Danger Zone
              </h3>
              <p class="text-neutral-600 text-sm leading-relaxed max-w-md">
                Deleting your account is permanent. All your data will be wiped immediately and
                cannot be recovered.
              </p>
            </div>
            <Button
              onclick={handleDeleteAccount}
              disabled={deleting}
              class="bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex-shrink-0"
            >
              <iconify-icon icon="solar:trash-bin-trash-bold" width="20"></iconify-icon>
              {deleting ? 'Deleting...' : 'Delete Account'}
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
      class="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl space-y-6"
    >
      <div class="space-y-2 text-center">
        <div
          class="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-500 mb-4"
        >
          <iconify-icon icon="solar:bomb-bold-duotone" width="32"></iconify-icon>
        </div>
        <h3 class="text-2xl font-black tracking-tight text-neutral-900">Delete Account?</h3>
        <p class="text-neutral-500 font-medium">
          This action is absolute. Your data will be permanently removed.
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
          Cancel
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
