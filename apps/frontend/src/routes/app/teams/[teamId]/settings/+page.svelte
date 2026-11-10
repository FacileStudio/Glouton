<script lang="ts">
  import { QUIET, type RouterOutputs } from '@repo/trpc-client';
  import { getErrorMessage } from '$lib/utils/trpc-error';
  import { onMount } from 'svelte';
  import type { PageProps } from './$types';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { trpc } from '$lib/trpc';
  import MailTransportSettings from '$lib/components/MailTransportSettings.svelte';
  import TeamWebhooks from '$lib/components/TeamWebhooks.svelte';
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
    Spinner,
    Switch,
    Tabs,
    Textarea,
    icons,
    toast,
  } from '@facile/muse';
  import { useT } from '$lib/i18n';

  const t = useT();
  let { params }: PageProps = $props();
  let teamId = $derived(params.teamId);
  let team = $state<RouterOutputs['team']['get'] | null>(null);
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
        await loadSmtpConfig();
      }
    } catch (error) {
      console.error('Error loading team:', error);
      toast.danger(getErrorMessage(error, t('teams.loadOneFailed')));
      goto(resolve('/app/teams'));
    } finally{
      loading = false;
    }
  }

  async function loadSmtpConfig() {
    try {
      const smtpConfig = await trpc.team.getSmtpConfig.query({ teamId }, { context: QUIET });
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
      toast.success(t('teams.settings.updated'));
      await loadTeam();
    } catch (error) {
      toast.danger(getErrorMessage(error, t('teams.settings.updateFailed')));
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
    } catch (error) {
      toast.danger(getErrorMessage(error, t('settings.smtp.invalid')));
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
      toast.success(t('teams.settings.smtpUpdated'));
    } catch (error) {
      toast.danger(getErrorMessage(error, t('settings.smtp.saveFailed')));
    } finally {
      saving = false;
    }
  }

  async function handleDeleteTeam() {
    if (!isOwner || deleteConfirmationText !== 'DELETE') return;
    deleting = true;
    try {
      await trpc.team.delete.mutate({ teamId });
      toast.success(t('teams.settings.deleted'));
      goto(resolve('/app/teams'));
    } catch (error) {
      toast.danger(getErrorMessage(error, t('teams.settings.deleteFailed')));
      deleteModalOpen = false;
    } finally {
      deleting = false;
    }
  }

  function openDeleteModal() {
    deleteModalOpen = true;
    deleteConfirmationText = '';
  }

  const tabs = $derived([
    { id: 'general', label: t('teams.settings.general'), icon: icons.settings },
    { id: 'smtp', label: t('teams.settings.smtp'), icon: icons.mail },
    { id: 'webhooks', label: t('webhooks.tab'), icon: 'solar:link-round-angle-linear' },
  ]);

  const revealButtonClass =
    'absolute top-0 right-0 inline-flex size-11 items-center justify-center rounded-fc-md text-fc-fg-muted transition-colors hover:text-fc-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring';
</script>

{#if loading}
  <div class="flex items-center justify-center py-16">
    <Spinner size="lg" label={t('teams.loadingOne')} />
  </div>
{:else if team}
  <div class="mx-auto flex w-full max-w-fc-lg flex-col gap-10">
    <PageHeader
      title={t('teams.settings.titleOf', { name: team.name })}
      description={t('teams.settings.subtitle')}
      back={{ href: `/app/teams/${teamId}`, label: team.name }}
    />

    {#if !canManage}
      <Alert tone="warning">
        {t('teams.settings.noPermission')}
      </Alert>
    {/if}

    <Tabs items={tabs} value={activeTab} onChange={(id) => (activeTab = id)} label={t('teams.settings.sections')} />

    {#if activeTab === 'general'}
      <SettingsSection
        title={t('teams.settings.generalTitle')}
        description={t('teams.settings.generalText')}
      >
        {#snippet actions()}
          {#if canManage}
            <Button icon={icons.check} onclick={handleUpdateGeneral} disabled={saving || !hasGeneralChanges}>
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          {/if}
        {/snippet}

        <SettingsRow stacked>
          <Field
            label={t('teams.settings.name')}
            helper={linked ? t('teams.settings.linkedHelper') : undefined}
            for="name"
            class="w-full"
          >
            <Input
              id="name"
              bind:value={generalForm.name}
              disabled={!canManage || linked}
              placeholder={t('teams.new.namePlaceholder')}
            />
          </Field>
        </SettingsRow>

        <SettingsRow stacked>
          <Field label={t('missions.detail.description')} for="description" class="w-full">
            <Textarea
              id="description"
              bind:value={generalForm.description}
              disabled={!canManage}
              placeholder={t('teams.new.descriptionPlaceholder')}
              rows={4}
              class="field-sizing-content min-h-24 max-h-[60vh] w-full disabled:cursor-not-allowed"
            />
          </Field>
        </SettingsRow>
      </SettingsSection>

      {#if linked && team.manageUrl}
        <SettingsSection title={t('teams.settings.registre')} description={t('teams.settings.registreText')}>
          <SettingsRow
            label={t('teams.settings.registreRow')}
            description={t('teams.settings.registreRowText')}
          >
            <Button variant="secondary" icon={icons.space} href={team.manageUrl}>{t('teams.manage')}</Button>
          </SettingsRow>
        </SettingsSection>
      {:else if isOwner}
        <SettingsSection title={t('teams.settings.danger')} description={t('teams.settings.dangerText')}>
          <SettingsRow
            label={t('teams.settings.delete')}
            description={t('teams.settings.deleteText')}
          >
            <Button variant="ghost-danger" icon={icons.remove} onclick={openDeleteModal}>
              {t('teams.settings.delete')}
            </Button>
          </SettingsRow>
        </SettingsSection>
      {/if}
    {:else if activeTab === 'webhooks'}
      <TeamWebhooks {teamId} canManage={Boolean(canManage)} />
    {:else if activeTab === 'smtp'}
      <MailTransportSettings {teamId} canEdit={Boolean(canManage)} />

      <SettingsSection
        title={t('teams.settings.smtpTitle')}
        description={t('teams.settings.smtpText')}
      >
        {#snippet actions()}
          {#if canManage}
            <Button variant="secondary" onclick={handleTestSmtp} disabled={testingSmtp || saving}>
              <iconify-icon icon="solar:test-tube-linear" width="16" height="16" class="block"></iconify-icon>
              {testingSmtp ? t('settings.smtp.testing') : t('settings.smtp.test')}
            </Button>
            <Button icon={icons.check} onclick={handleUpdateSmtp} disabled={saving || !hasSmtpChanges}>
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          {/if}
        {/snippet}

        <SettingsRow stacked>
          <div class="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t('settings.smtp.host')} for="smtpHost">
              <Input
                id="smtpHost"
                bind:value={smtpForm.smtpHost}
                disabled={!canManage}
                placeholder="smtp.gmail.com"
              />
            </Field>
            <Field label={t('settings.smtp.port')} for="smtpPort">
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

        <SettingsRow label={t('settings.smtp.secure')}>
          <Switch
            bind:checked={smtpForm.smtpSecure}
            disabled={!canManage}
            aria-label={t('settings.smtp.secure')}
          />
        </SettingsRow>

        <SettingsRow stacked>
          <div class="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t('teams.settings.smtpUser')} for="smtpUser">
              <Input
                id="smtpUser"
                bind:value={smtpForm.smtpUser}
                disabled={!canManage}
                placeholder="votre@email.com"
              />
            </Field>
            <Field label={t('teams.settings.smtpPassword')} for="smtpPass">
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
                    aria-label={t('teams.settings.togglePassword')}
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
          <div class="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t('settings.smtp.fromName')} for="smtpFromName">
              <Input
                id="smtpFromName"
                bind:value={smtpForm.smtpFromName}
                disabled={!canManage}
                placeholder={t('teams.settings.fromNamePlaceholder')}
              />
            </Field>
            <Field label={t('settings.smtp.fromEmail')} for="smtpFromEmail">
              <Input
                id="smtpFromEmail"
                type="email"
                bind:value={smtpForm.smtpFromEmail}
                disabled={!canManage}
                placeholder={t('teams.settings.fromEmailPlaceholder')}
              />
            </Field>
          </div>
        </SettingsRow>
      </SettingsSection>
    {/if}
  </div>
{/if}

<Modal bind:open={deleteModalOpen} title={t('teams.settings.deleteTitle')}>
  <p class="text-fc-sm text-fc-fg-muted">
    {t('teams.settings.deleteBody')}
  </p>

  <Field label={t('settings.delete.typeToConfirm')} for="deleteConfirm">
    <Input id="deleteConfirm" type="text" bind:value={deleteConfirmationText} placeholder="DELETE" />
  </Field>

  {#snippet footer()}
    <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="ghost" onclick={() => (deleteModalOpen = false)}>{t('common.cancel')}</Button>
      <Button
        variant="ghost-danger"
        onclick={handleDeleteTeam}
        disabled={deleteConfirmationText !== 'DELETE' || deleting}
      >
        {deleting ? t('settings.delete.deleting') : t('common.confirm')}
      </Button>
    </div>
  {/snippet}
</Modal>
