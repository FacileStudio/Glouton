<script lang="ts">
  import authStore from '$lib/auth-store';
  import { trpc } from '$lib/trpc';
  import { Button, Input, Spinner, Alert, LanguageSwitcher, Toggle } from '@repo/ui';
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
    { id: 'opportunities', name: 'Opportunities', icon: 'solar:clipboard-list-bold' },
  ];

  const OPPORTUNITY_SOURCES = [
    { value: 'MALT', label: 'Malt' },
    { value: 'CODEUR', label: 'Codeur' },
    { value: 'FREELANCE_INFORMATIQUE', label: 'Freelance Informatique' },
    { value: 'COMET', label: 'Comet' },
    { value: 'LE_HIBOU', label: 'Le Hibou' },
    { value: 'UPWORK', label: 'Upwork' },
    { value: 'FIVERR', label: 'Fiverr' },
    { value: 'FREELANCER', label: 'Freelancer' },
    { value: 'TOPTAL', label: 'Toptal' },
    { value: 'WE_WORK_REMOTELY', label: 'We Work Remotely' },
    { value: 'REMOTE_CO', label: 'Remote.co' },
    { value: 'REMOTIVE', label: 'Remotive' },
    { value: 'LINKEDIN', label: 'LinkedIn' },
    { value: 'INDEED', label: 'Indeed' },
    { value: 'GURU', label: 'Guru' },
    { value: 'PEOPLEPERHOUR', label: 'PeoplePerHour' },
  ];

  const OPPORTUNITY_CATEGORIES = [
    { value: 'WEB_DEVELOPMENT', label: 'Web Development' },
    { value: 'WEB_DESIGN', label: 'Web Design' },
    { value: 'MOBILE_DEVELOPMENT', label: 'Mobile Development' },
    { value: 'UI_UX_DESIGN', label: 'UI/UX Design' },
    { value: 'FRONTEND', label: 'Frontend' },
    { value: 'BACKEND', label: 'Backend' },
    { value: 'FULLSTACK', label: 'Fullstack' },
    { value: 'DEVOPS', label: 'DevOps' },
    { value: 'DATA_SCIENCE', label: 'Data Science' },
    { value: 'MACHINE_LEARNING', label: 'Machine Learning' },
    { value: 'BLOCKCHAIN', label: 'Blockchain' },
    { value: 'GAME_DEVELOPMENT', label: 'Game Development' },
    { value: 'WORDPRESS', label: 'WordPress' },
    { value: 'ECOMMERCE', label: 'E-commerce' },
    { value: 'SEO', label: 'SEO' },
    { value: 'CONTENT_WRITING', label: 'Content Writing' },
    { value: 'COPYWRITING', label: 'Copywriting' },
    { value: 'GRAPHIC_DESIGN', label: 'Graphic Design' },
    { value: 'VIDEO_EDITING', label: 'Video Editing' },
    { value: 'MARKETING', label: 'Marketing' },
    { value: 'CONSULTING', label: 'Consulting' },
    { value: 'OTHER', label: 'Other' },
  ];

  let opportunityPreferences = $state({
    discordWebhook: '',
    enableDiscordNotifications: false,
    enabledSources: [] as string[],
    enabledCategories: [] as string[],
    keywords: [] as string[],
    excludeKeywords: [] as string[],
    minBudget: null as number | null,
    remoteOnly: false,
  });

  let originalOpportunityPreferences = $state({
    discordWebhook: '',
    enableDiscordNotifications: false,
    enabledSources: [] as string[],
    enabledCategories: [] as string[],
    keywords: [] as string[],
    excludeKeywords: [] as string[],
    minBudget: null as number | null,
    remoteOnly: false,
  });

  let keywordsInput = $state('');
  let excludeKeywordsInput = $state('');
  let testingWebhook = $state(false);

  let hasOpportunityPreferencesChanges = $derived(
    opportunityPreferences.discordWebhook !== originalOpportunityPreferences.discordWebhook ||
    opportunityPreferences.enableDiscordNotifications !== originalOpportunityPreferences.enableDiscordNotifications ||
    JSON.stringify(opportunityPreferences.enabledSources) !== JSON.stringify(originalOpportunityPreferences.enabledSources) ||
    JSON.stringify(opportunityPreferences.enabledCategories) !== JSON.stringify(originalOpportunityPreferences.enabledCategories) ||
    JSON.stringify(opportunityPreferences.keywords) !== JSON.stringify(originalOpportunityPreferences.keywords) ||
    JSON.stringify(opportunityPreferences.excludeKeywords) !== JSON.stringify(originalOpportunityPreferences.excludeKeywords) ||
    opportunityPreferences.minBudget !== originalOpportunityPreferences.minBudget ||
    opportunityPreferences.remoteOnly !== originalOpportunityPreferences.remoteOnly
  );

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
      if (formData.hunterApiKey && formData.hunterApiKey.trim()) updatePayload.hunterApiKey = formData.hunterApiKey.trim();
      /**
       * if
       */
      if (formData.apolloApiKey && formData.apolloApiKey.trim()) updatePayload.apolloApiKey = formData.apolloApiKey.trim();
      /**
       * if
       */
      if (formData.snovApiKey && formData.snovApiKey.trim()) updatePayload.snovApiKey = formData.snovApiKey.trim();
      /**
       * if
       */
      if (formData.hasdataApiKey && formData.hasdataApiKey.trim()) updatePayload.hasdataApiKey = formData.hasdataApiKey.trim();
      /**
       * if
       */
      if (formData.contactoutApiKey && formData.contactoutApiKey.trim()) updatePayload.contactoutApiKey = formData.contactoutApiKey.trim();

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
   * handleUpdateOpportunityPreferences
   */
  async function handleUpdateOpportunityPreferences() {
    saving = true;
    message = null;
    try {
      const updatedPrefs = await trpc.opportunity.updatePreferences.mutate({
        discordWebhook: opportunityPreferences.discordWebhook || null,
        enableDiscordNotifications: opportunityPreferences.enableDiscordNotifications,
        enabledSources: opportunityPreferences.enabledSources as any[],
        enabledCategories: opportunityPreferences.enabledCategories as any[],
        keywords: opportunityPreferences.keywords,
        excludeKeywords: opportunityPreferences.excludeKeywords,
        minBudget: opportunityPreferences.minBudget,
        remoteOnly: opportunityPreferences.remoteOnly,
      });

      originalOpportunityPreferences = {
        discordWebhook: updatedPrefs.discordWebhook || '',
        enableDiscordNotifications: updatedPrefs.enableDiscordNotifications,
        enabledSources: [...(updatedPrefs.enabledSources || [])],
        enabledCategories: [...(updatedPrefs.enabledCategories || [])],
        keywords: [...(updatedPrefs.keywords || [])],
        excludeKeywords: [...(updatedPrefs.excludeKeywords || [])],
        minBudget: updatedPrefs.minBudget,
        remoteOnly: updatedPrefs.remoteOnly,
      };

      toast.push('Opportunity preferences updated successfully!', 'success');
      message = { type: 'success', text: 'Opportunity preferences updated successfully!' };
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to update opportunity preferences';
      console.error('Failed to update opportunity preferences:', error);
      toast.push(errorMessage, 'error');
      message = { type: 'error', text: errorMessage };
    } finally {
      saving = false;
    }
  }

  /**
   * handleTestDiscordWebhook
   */
  async function handleTestDiscordWebhook() {
    /**
     * if
     */
    if (!opportunityPreferences.discordWebhook) {
      toast.push('Please enter a Discord webhook URL', 'error');
      return;
    }

    testingWebhook = true;
    try {
      const result = await trpc.opportunity.testDiscordWebhook.mutate({
        webhookUrl: opportunityPreferences.discordWebhook,
      });

      /**
       * if
       */
      if (result.success) {
        toast.push('Test notification sent successfully!', 'success');
      } else {
        toast.push(result.error || 'Failed to send test notification', 'error');
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to test webhook';
      console.error('Failed to test webhook:', error);
      toast.push(errorMessage, 'error');
    } finally {
      testingWebhook = false;
    }
  }

  /**
   * toggleSource
   */
  function toggleSource(source: string) {
    /**
     * if
     */
    if (opportunityPreferences.enabledSources.includes(source)) {
      opportunityPreferences.enabledSources = opportunityPreferences.enabledSources.filter((s) => s !== source);
    } else {
      opportunityPreferences.enabledSources = [...opportunityPreferences.enabledSources, source];
    }
  }

  /**
   * toggleCategory
   */
  function toggleCategory(category: string) {
    /**
     * if
     */
    if (opportunityPreferences.enabledCategories.includes(category)) {
      opportunityPreferences.enabledCategories = opportunityPreferences.enabledCategories.filter((c) => c !== category);
    } else {
      opportunityPreferences.enabledCategories = [...opportunityPreferences.enabledCategories, category];
    }
  }

  /**
   * addKeyword
   */
  function addKeyword() {
    const keyword = keywordsInput.trim();
    /**
     * if
     */
    if (keyword && !opportunityPreferences.keywords.includes(keyword)) {
      opportunityPreferences.keywords = [...opportunityPreferences.keywords, keyword];
      keywordsInput = '';
    }
  }

  /**
   * removeKeyword
   */
  function removeKeyword(keyword: string) {
    opportunityPreferences.keywords = opportunityPreferences.keywords.filter((k) => k !== keyword);
  }

  /**
   * addExcludeKeyword
   */
  function addExcludeKeyword() {
    const keyword = excludeKeywordsInput.trim();
    /**
     * if
     */
    if (keyword && !opportunityPreferences.excludeKeywords.includes(keyword)) {
      opportunityPreferences.excludeKeywords = [...opportunityPreferences.excludeKeywords, keyword];
      excludeKeywordsInput = '';
    }
  }

  /**
   * removeExcludeKeyword
   */
  function removeExcludeKeyword(keyword: string) {
    opportunityPreferences.excludeKeywords = opportunityPreferences.excludeKeywords.filter((k) => k !== keyword);
  }

  /**
   * onMount
   */
  onMount(async () => {
    const [userResult, prefsResult] = await Promise.allSettled([
      trpc.user.me.query(),
      trpc.opportunity.getPreferences.query(),
    ]);

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

    /**
     * if
     */
    if (prefsResult.status === 'fulfilled' && prefsResult.value) {
      const prefs = prefsResult.value;
      opportunityPreferences = {
        discordWebhook: prefs.discordWebhook || '',
        enableDiscordNotifications: prefs.enableDiscordNotifications,
        enabledSources: [...(prefs.enabledSources || [])],
        enabledCategories: [...(prefs.enabledCategories || [])],
        keywords: [...(prefs.keywords || [])],
        excludeKeywords: [...(prefs.excludeKeywords || [])],
        minBudget: prefs.minBudget,
        remoteOnly: prefs.remoteOnly,
      };

      originalOpportunityPreferences = {
        discordWebhook: prefs.discordWebhook || '',
        enableDiscordNotifications: prefs.enableDiscordNotifications,
        enabledSources: [...(prefs.enabledSources || [])],
        enabledCategories: [...(prefs.enabledCategories || [])],
        keywords: [...(prefs.keywords || [])],
        excludeKeywords: [...(prefs.excludeKeywords || [])],
        minBudget: prefs.minBudget,
        remoteOnly: prefs.remoteOnly,
      };
    } else if (prefsResult.status === 'rejected') {
      console.error('Failed to fetch opportunity preferences:', prefsResult.reason);
    }
  });
</script>

<div class="min-h-screen p-6 lg:p-12 max-w-6xl mx-auto space-y-8 pb-32" style="background-color: #FAF7F5;">
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
            <p class="text-neutral-500 text-sm">Update your profile details and contact information</p>
          </div>

          <div class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-2">
                <label for="firstName" class="text-sm font-bold text-neutral-700 block">First Name</label>
                <Input
                  id="firstName"
                  bind:value={formData.firstName}
                  placeholder="John"
                  class="rounded-xl border-neutral-200 focus:border-neutral-900 transition-colors"
                />
              </div>
              <div class="space-y-2">
                <label for="lastName" class="text-sm font-bold text-neutral-700 block">Last Name</label>
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
                <iconify-icon icon="solar:check-circle-bold" width="18"></iconify-icon> Changes saved successfully
              </span>
            {:else}
              <div></div>
            {/if}
            <Button onclick={handleUpdateProfile} disabled={saving || !hasProfileChanges} class="px-6 bg-black text-white hover:bg-neutral-800 disabled:opacity-50">
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
                <iconify-icon icon="solar:key-square-bold-duotone" width="20" class="text-white"></iconify-icon>
              </div>
              <h2 class="text-2xl font-black" style="color: #291334;">Security</h2>
            </div>
            <p class="text-neutral-500 text-sm">Update your password to keep your account secure</p>
          </div>

          <div class="space-y-6">
            <div class="space-y-2">
              <label for="currentPassword" class="text-sm font-bold text-neutral-700 block">Current Password</label>
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
                <label for="newPassword" class="text-sm font-bold text-neutral-700 block">New Password</label>
                <Input
                  id="newPassword"
                  type="password"
                  bind:value={formData.newPassword}
                  placeholder="••••••••"
                  class="rounded-xl"
                />
              </div>
              <div class="space-y-2">
                <label for="confirmPassword" class="text-sm font-bold text-neutral-700 block">Confirm Password</label>
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
            <Button onclick={handleChangePassword} disabled={saving} class="px-6 bg-black text-white hover:bg-neutral-800 disabled:opacity-50">
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
                <iconify-icon icon="solar:key-bold-duotone" width="20" class="text-white"></iconify-icon>
              </div>
              <h2 class="text-2xl font-black" style="color: #291334;">Lead Source API Keys</h2>
            </div>
            <p class="text-neutral-500 text-sm">Configure API keys for lead extraction sources</p>
          </div>

          <div class="space-y-6">
            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div class="flex gap-3">
                <iconify-icon icon="solar:info-circle-bold" width="20" class="text-blue-600 flex-shrink-0 mt-0.5"></iconify-icon>
                <div class="text-sm text-blue-800">
                  <p class="font-bold mb-1">Free tier available</p>
                  <p>Most services offer free tiers. Enter the API keys you have and the system will automatically use the best available source for each hunt.</p>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-6">
              <div class="space-y-2">
                <label for="hunterApiKey" class="text-sm font-bold text-neutral-700 flex items-center gap-2">
                  Hunter.io API Key
                  {#if existingApiKeys.hunterApiKey}
                    <span class="text-xs font-bold text-green-600 flex items-center gap-1 px-2 py-0.5 bg-green-50 rounded-full">
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
                      onclick={() => showApiKeys.hunterApiKey = !showApiKeys.hunterApiKey}
                      aria-label={showApiKeys.hunterApiKey ? 'Hide Hunter.io API key' : 'Show Hunter.io API key'}
                      class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                    >
                      <iconify-icon icon={showApiKeys.hunterApiKey ? 'solar:eye-bold' : 'solar:eye-closed-bold'} width="20"></iconify-icon>
                    </button>
                  {/if}
                </div>
                <p class="text-xs text-neutral-500">
                  Get yours at <a href="https://hunter.io/api" target="_blank" rel="noopener noreferrer" class="underline hover:text-neutral-900">hunter.io/api</a>
                </p>
              </div>

              <div class="space-y-2">
                <label for="apolloApiKey" class="text-sm font-bold text-neutral-700 flex items-center gap-2">
                  Apollo.io API Key
                  {#if existingApiKeys.apolloApiKey}
                    <span class="text-xs font-bold text-green-600 flex items-center gap-1 px-2 py-0.5 bg-green-50 rounded-full">
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
                      onclick={() => showApiKeys.apolloApiKey = !showApiKeys.apolloApiKey}
                      aria-label={showApiKeys.apolloApiKey ? 'Hide Apollo.io API key' : 'Show Apollo.io API key'}
                      class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                    >
                      <iconify-icon icon={showApiKeys.apolloApiKey ? 'solar:eye-bold' : 'solar:eye-closed-bold'} width="20"></iconify-icon>
                    </button>
                  {/if}
                </div>
                <p class="text-xs text-neutral-500">
                  Get yours at <a href="https://apollo.io/api" target="_blank" rel="noopener noreferrer" class="underline hover:text-neutral-900">apollo.io/api</a>
                </p>
              </div>

              <div class="space-y-2">
                <label for="snovApiKey" class="text-sm font-bold text-neutral-700 flex items-center gap-2">
                  Snov.io API Key
                  {#if existingApiKeys.snovApiKey}
                    <span class="text-xs font-bold text-green-600 flex items-center gap-1 px-2 py-0.5 bg-green-50 rounded-full">
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
                      onclick={() => showApiKeys.snovApiKey = !showApiKeys.snovApiKey}
                      aria-label={showApiKeys.snovApiKey ? 'Hide Snov.io API key' : 'Show Snov.io API key'}
                      class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                    >
                      <iconify-icon icon={showApiKeys.snovApiKey ? 'solar:eye-bold' : 'solar:eye-closed-bold'} width="20"></iconify-icon>
                    </button>
                  {/if}
                </div>
                <p class="text-xs text-neutral-500">
                  Get yours at <a href="https://snov.io/api" target="_blank" rel="noopener noreferrer" class="underline hover:text-neutral-900">snov.io/api</a>
                </p>
              </div>

              <div class="space-y-2">
                <label for="hasdataApiKey" class="text-sm font-bold text-neutral-700 flex items-center gap-2">
                  HasData API Key
                  {#if existingApiKeys.hasdataApiKey}
                    <span class="text-xs font-bold text-green-600 flex items-center gap-1 px-2 py-0.5 bg-green-50 rounded-full">
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
                      onclick={() => showApiKeys.hasdataApiKey = !showApiKeys.hasdataApiKey}
                      aria-label={showApiKeys.hasdataApiKey ? 'Hide HasData API key' : 'Show HasData API key'}
                      class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                    >
                      <iconify-icon icon={showApiKeys.hasdataApiKey ? 'solar:eye-bold' : 'solar:eye-closed-bold'} width="20"></iconify-icon>
                    </button>
                  {/if}
                </div>
                <p class="text-xs text-neutral-500">
                  Get yours at <a href="https://hasdata.com/api" target="_blank" rel="noopener noreferrer" class="underline hover:text-neutral-900">hasdata.com/api</a>
                </p>
              </div>

              <div class="space-y-2">
                <label for="contactoutApiKey" class="text-sm font-bold text-neutral-700 flex items-center gap-2">
                  ContactOut API Key
                  {#if existingApiKeys.contactoutApiKey}
                    <span class="text-xs font-bold text-green-600 flex items-center gap-1 px-2 py-0.5 bg-green-50 rounded-full">
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
                      onclick={() => showApiKeys.contactoutApiKey = !showApiKeys.contactoutApiKey}
                      aria-label={showApiKeys.contactoutApiKey ? 'Hide ContactOut API key' : 'Show ContactOut API key'}
                      class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                    >
                      <iconify-icon icon={showApiKeys.contactoutApiKey ? 'solar:eye-bold' : 'solar:eye-closed-bold'} width="20"></iconify-icon>
                    </button>
                  {/if}
                </div>
                <p class="text-xs text-neutral-500">
                  Get yours at <a href="https://contactout.com/api" target="_blank" rel="noopener noreferrer" class="underline hover:text-neutral-900">contactout.com/api</a>
                </p>
              </div>
            </div>
          </div>

          <div class="flex justify-end pt-8 mt-8 border-t border-neutral-100">
            <Button onclick={handleUpdateApiKeys} disabled={saving || !hasApiKeyChanges} class="px-6 bg-black text-white hover:bg-neutral-800 disabled:opacity-50">
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
              <h3 class="font-black text-lg mb-1" style="color: #291334;">Language</h3>
              <p class="text-sm text-neutral-500">Choose your interface language</p>
            </div>
            <LanguageSwitcher />
          </div>

          <div class="p-8 rounded-2xl shadow-lg" style="background-color: #EFEAE6;">
            <div class="mb-6">
              <h3 class="font-black text-lg mb-1" style="color: #291334;">Session</h3>
              <p class="text-sm text-neutral-500">End your current session</p>
            </div>
            <Button onclick={() => authStore.logout()} class="bg-red-600 text-white hover:bg-red-700 w-full">
              <iconify-icon icon="solar:logout-2-bold" width="20"></iconify-icon>
              Log Out
            </Button>
          </div>
        </div>

        <div class="rounded-2xl border-2 border-red-200 shadow-lg p-8 md:p-10" style="background-color: #EFEAE6;">
          <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h3 class="text-red-600 font-black text-xl mb-2 flex items-center gap-2">
                <iconify-icon icon="solar:danger-triangle-bold" width="24"></iconify-icon>
                Danger Zone
              </h3>
              <p class="text-neutral-600 text-sm leading-relaxed max-w-md">
                Deleting your account is permanent. All your data will be wiped immediately and cannot be recovered.
              </p>
            </div>
            <Button onclick={handleDeleteAccount} disabled={deleting} class="bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex-shrink-0">
              <iconify-icon icon="solar:trash-bin-trash-bold" width="20"></iconify-icon>
              {deleting ? 'Deleting...' : 'Delete Account'}
            </Button>
          </div>
        </div>
      </div>
    {:else if activeTab === 'opportunities'}
      <div in:fade={{ duration: 300 }} class="space-y-6">
        <div class="p-8 md:p-10 rounded-2xl shadow-lg" style="background-color: #EFEAE6;">
          <div class="mb-8">
            <div class="flex items-center gap-3 mb-2">
              <div class="w-11 h-11 flex items-center justify-center bg-brand-purple rounded-lg">
                <iconify-icon icon="solar:bell-bold-duotone" width="20" class="text-white"></iconify-icon>
              </div>
              <h2 class="text-2xl font-black" style="color: #291334;">Discord Notifications</h2>
            </div>
            <p class="text-neutral-500 text-sm">Get notified about new opportunities matching your preferences</p>
          </div>

          <div class="space-y-6">
            <div class="flex items-center justify-between p-4 bg-neutral-50 rounded-xl">
              <div>
                <span class="text-sm font-bold text-neutral-700 block">Enable Discord Notifications</span>
                <p class="text-xs text-neutral-500 mt-1">Receive notifications when new opportunities match your criteria</p>
              </div>
              <Toggle bind:checked={opportunityPreferences.enableDiscordNotifications} />
            </div>

            <div class="space-y-2">
              <label for="discordWebhook" class="text-sm font-bold text-neutral-700 block">Discord Webhook URL</label>
              <Input
                id="discordWebhook"
                type="text"
                bind:value={opportunityPreferences.discordWebhook}
                placeholder="https://discord.com/api/webhooks/..."
                class="rounded-xl font-mono"
                disabled={!opportunityPreferences.enableDiscordNotifications}
              />
              <p class="text-xs text-neutral-500">
                Create a webhook in your Discord server settings under Integrations
              </p>
            </div>

            {#if opportunityPreferences.discordWebhook && opportunityPreferences.enableDiscordNotifications}
              <Button
                onclick={handleTestDiscordWebhook}
                disabled={testingWebhook}
                class="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {#if testingWebhook}
                  <Spinner size="sm" class="text-white" />
                {:else}
                  <iconify-icon icon="solar:paper-plane-bold" width="18"></iconify-icon>
                {/if}
                {testingWebhook ? 'Sending...' : 'Send Test Notification'}
              </Button>
            {/if}
          </div>
        </div>

        <div class="p-8 md:p-10 rounded-2xl shadow-lg" style="background-color: #EFEAE6;">
          <div class="mb-8">
            <div class="flex items-center gap-3 mb-2">
              <div class="w-11 h-11 flex items-center justify-center bg-brand-purple rounded-lg">
                <iconify-icon icon="solar:box-bold-duotone" width="20" class="text-white"></iconify-icon>
              </div>
              <h2 class="text-2xl font-black" style="color: #291334;">Source Preferences</h2>
            </div>
            <p class="text-neutral-500 text-sm">Select which platforms to monitor for opportunities</p>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            {#each OPPORTUNITY_SOURCES as source}
              <button
                onclick={() => toggleSource(source.value)}
                class="flex items-center gap-2 p-3 rounded-xl border-2 transition-all {opportunityPreferences.enabledSources.includes(source.value)
                  ? 'border-brand-purple bg-brand-purple/5'
                  : 'border-neutral-200 hover:border-neutral-300'}"
              >
                <div class="w-5 h-5 rounded border-2 flex items-center justify-center {opportunityPreferences.enabledSources.includes(source.value)
                  ? 'border-brand-purple bg-brand-purple'
                  : 'border-neutral-300'}">
                  {#if opportunityPreferences.enabledSources.includes(source.value)}
                    <iconify-icon icon="solar:check-bold" width="14" class="text-white"></iconify-icon>
                  {/if}
                </div>
                <span class="text-sm font-bold {opportunityPreferences.enabledSources.includes(source.value)
                  ? 'text-brand-purple'
                  : 'text-neutral-700'}">{source.label}</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="p-8 md:p-10 rounded-2xl shadow-lg" style="background-color: #EFEAE6;">
          <div class="mb-8">
            <div class="flex items-center gap-3 mb-2">
              <div class="w-11 h-11 flex items-center justify-center bg-brand-purple rounded-lg">
                <iconify-icon icon="solar:tag-bold-duotone" width="20" class="text-white"></iconify-icon>
              </div>
              <h2 class="text-2xl font-black" style="color: #291334;">Category Preferences</h2>
            </div>
            <p class="text-neutral-500 text-sm">Choose which categories you're interested in</p>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            {#each OPPORTUNITY_CATEGORIES as category}
              <button
                onclick={() => toggleCategory(category.value)}
                class="flex items-center gap-2 p-3 rounded-xl border-2 transition-all {opportunityPreferences.enabledCategories.includes(category.value)
                  ? 'border-brand-purple bg-brand-purple/5'
                  : 'border-neutral-200 hover:border-neutral-300'}"
              >
                <div class="w-5 h-5 rounded border-2 flex items-center justify-center {opportunityPreferences.enabledCategories.includes(category.value)
                  ? 'border-brand-purple bg-brand-purple'
                  : 'border-neutral-300'}">
                  {#if opportunityPreferences.enabledCategories.includes(category.value)}
                    <iconify-icon icon="solar:check-bold" width="14" class="text-white"></iconify-icon>
                  {/if}
                </div>
                <span class="text-sm font-bold {opportunityPreferences.enabledCategories.includes(category.value)
                  ? 'text-brand-purple'
                  : 'text-neutral-700'}">{category.label}</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="p-8 md:p-10 rounded-2xl shadow-lg" style="background-color: #EFEAE6;">
          <div class="mb-8">
            <div class="flex items-center gap-3 mb-2">
              <div class="w-11 h-11 flex items-center justify-center bg-brand-purple rounded-lg">
                <iconify-icon icon="solar:filter-bold-duotone" width="20" class="text-white"></iconify-icon>
              </div>
              <h2 class="text-2xl font-black" style="color: #291334;">Filters</h2>
            </div>
            <p class="text-neutral-500 text-sm">Refine opportunities with keywords and budget</p>
          </div>

          <div class="space-y-6">
            <div class="space-y-2">
              <label for="keywordsInput" class="text-sm font-bold text-neutral-700 block">Include Keywords</label>
              <div class="flex gap-2">
                <Input
                  id="keywordsInput"
                  type="text"
                  bind:value={keywordsInput}
                  placeholder="Add keyword..."
                  class="rounded-xl flex-1"
                  onkeydown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addKeyword();
                    }
                  }}
                />
                <Button onclick={addKeyword} class="bg-brand-purple text-white hover:bg-brand-purple/90">
                  <iconify-icon icon="solar:add-circle-bold" width="20"></iconify-icon>
                  Add
                </Button>
              </div>
              {#if opportunityPreferences.keywords.length > 0}
                <div class="flex flex-wrap gap-2 mt-3">
                  {#each opportunityPreferences.keywords as keyword}
                    <span class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-purple/10 text-brand-purple rounded-lg text-sm font-bold">
                      {keyword}
                      <button onclick={() => removeKeyword(keyword)} aria-label={`Remove keyword ${keyword}`} class="hover:text-brand-purple/70">
                        <iconify-icon icon="solar:close-circle-bold" width="16"></iconify-icon>
                      </button>
                    </span>
                  {/each}
                </div>
              {/if}
            </div>

            <div class="space-y-2">
              <label for="excludeKeywordsInput" class="text-sm font-bold text-neutral-700 block">Exclude Keywords</label>
              <div class="flex gap-2">
                <Input
                  id="excludeKeywordsInput"
                  type="text"
                  bind:value={excludeKeywordsInput}
                  placeholder="Add keyword to exclude..."
                  class="rounded-xl flex-1"
                  onkeydown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addExcludeKeyword();
                    }
                  }}
                />
                <Button onclick={addExcludeKeyword} class="bg-red-600 text-white hover:bg-red-700">
                  <iconify-icon icon="solar:add-circle-bold" width="20"></iconify-icon>
                  Add
                </Button>
              </div>
              {#if opportunityPreferences.excludeKeywords.length > 0}
                <div class="flex flex-wrap gap-2 mt-3">
                  {#each opportunityPreferences.excludeKeywords as keyword}
                    <span class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-bold">
                      {keyword}
                      <button onclick={() => removeExcludeKeyword(keyword)} aria-label={`Remove excluded keyword ${keyword}`} class="hover:text-red-600">
                        <iconify-icon icon="solar:close-circle-bold" width="16"></iconify-icon>
                      </button>
                    </span>
                  {/each}
                </div>
              {/if}
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-2">
                <label for="minBudget" class="text-sm font-bold text-neutral-700 block">Minimum Budget</label>
                <Input
                  id="minBudget"
                  type="number"
                  bind:value={opportunityPreferences.minBudget}
                  placeholder="0"
                  class="rounded-xl"
                  min="0"
                />
              </div>

              <div class="flex items-center justify-between p-4 bg-neutral-50 rounded-xl">
                <div>
                  <span class="text-sm font-bold text-neutral-700 block">Remote Only</span>
                  <p class="text-xs text-neutral-500 mt-1">Only show remote opportunities</p>
                </div>
                <Toggle bind:checked={opportunityPreferences.remoteOnly} />
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-end">
          <Button
            onclick={handleUpdateOpportunityPreferences}
            disabled={saving || !hasOpportunityPreferencesChanges}
            class="px-6 bg-black text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {#if saving}
              <Spinner size="sm" class="text-white" />
            {:else}
              <iconify-icon icon="solar:diskette-bold" width="18"></iconify-icon>
            {/if}
            {saving ? 'Saving...' : 'Save Preferences'}
          </Button>
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
        <label for="deleteConfirm" class="text-xs font-bold text-neutral-500 uppercase tracking-wide block mb-2">
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
