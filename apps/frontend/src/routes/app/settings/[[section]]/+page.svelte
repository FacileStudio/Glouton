<script lang="ts">
  import { getErrorMessage } from '$lib/utils/trpc-error';
  import authStore from '$lib/auth-store';
  import MailTransportSettings from '$lib/components/MailTransportSettings.svelte';
  import { trpc } from '$lib/trpc';
  import { useT } from '$lib/i18n';
  import { QUIET } from '@repo/trpc-client';
  import { SPACES_URL, persistLocale, persistTheme } from '$lib/preferences';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import {
    Badge,
    Button,
    DangerZone,
    Field,
    Icon,
    Input,
    Modal,
    PreferencesSection,
    ProfileSection,
    SettingsLayout,
    SettingsRow,
    SettingsSection,
    SubscriptionSection,
    Switch,
    getI18n,
    icons,
    readTheme,
    settingsRoute,
    toast,
    type Theme,
  } from '@facile/muse';
  import { logger } from '@repo/logger';
  import { onMount } from 'svelte';

  const t = useT();
  const i18n = getI18n();

  type SmtpForm = {
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPass: string;
    smtpFromName: string;
    smtpFromEmail: string;
  };

  const emptySmtp = (): SmtpForm => ({
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    smtpFromName: '',
    smtpFromEmail: '',
  });

  let saving = $state(false);
  let deleting = $state(false);
  let deleteModalOpen = $state(false);
  let deleteConfirmationText = $state('');
  let showSmtpPass = $state(false);
  let testingSmtp = $state(false);
  let form = $state<SmtpForm>(emptySmtp());
  let existing = $state<SmtpForm>(emptySmtp());
  let plan = $state<{ allowed: boolean; aiAccess: boolean; plans: string[] } | null>(null);
  let theme = $state<Theme>('system');

  const user = $derived($authStore.user);
  const name = $derived(
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || '',
  );
  const hasSmtpChanges = $derived(
    form.smtpHost !== existing.smtpHost ||
      form.smtpPort !== existing.smtpPort ||
      form.smtpSecure !== existing.smtpSecure ||
      form.smtpUser !== existing.smtpUser ||
      form.smtpPass !== existing.smtpPass ||
      form.smtpFromName !== existing.smtpFromName ||
      form.smtpFromEmail !== existing.smtpFromEmail,
  );

  const sections = $derived([
    { id: 'profile', label: i18n.t('settings.profile.title'), icon: icons.userCircle, href: '/app/settings/profile' },
    { id: 'preferences', label: i18n.t('settings.preferences.title'), icon: icons.settings, href: '/app/settings/preferences' },
    { id: 'mail', label: t('settings.mail.nav'), icon: icons.mail, href: '/app/settings/mail' },
    { id: 'subscription', label: i18n.t('settings.subscription.title'), icon: icons.card, href: '/app/settings/subscription' },
    { id: 'advanced', label: t('settings.advanced.nav'), icon: icons.shield, href: '/app/settings/advanced' },
  ]);

  const route = $derived(
    settingsRoute(
      page.params.section,
      sections,
    ),
  );

  $effect(() => {
    if (!route.known) void goto(resolve('/app/settings'), { replaceState: true });
  });

  function applySmtp(config: Awaited<ReturnType<typeof trpc.user.getSmtpConfig.query>>) {
    const next: SmtpForm = {
      smtpHost: config.smtpHost || '',
      smtpPort: config.smtpPort || 587,
      smtpSecure: config.smtpSecure || false,
      smtpUser: config.smtpUser || '',
      smtpPass: config.smtpPass || '',
      smtpFromName: config.smtpFromName || '',
      smtpFromEmail: config.smtpFromEmail || '',
    };
    existing = { ...next };
    form = { ...next };
  }

  function changeTheme(next: Theme) {
    theme = next;
    persistTheme(next);
  }

  async function handleTestSmtpConfig() {
    if (
      !form.smtpHost ||
      !form.smtpPort ||
      !form.smtpUser ||
      !form.smtpPass ||
      !form.smtpFromName ||
      !form.smtpFromEmail
    ) {
      toast.danger(t('settings.smtp.fillAll'));
      return;
    }

    testingSmtp = true;
    try {
      await trpc.user.testSmtpConfig.mutate({ ...form });
      toast.success(t('settings.smtp.valid'));
    } catch (error) {
      toast.danger(getErrorMessage(error, t('settings.smtp.invalid')));
    } finally {
      testingSmtp = false;
    }
  }

  async function handleUpdateSmtpConfig() {
    saving = true;
    try {
      await trpc.user.updateSmtpConfig.mutate({
        smtpHost: form.smtpHost || undefined,
        smtpPort: form.smtpPort || undefined,
        smtpSecure: form.smtpSecure,
        smtpUser: form.smtpUser || undefined,
        smtpPass: form.smtpPass || undefined,
        smtpFromName: form.smtpFromName || undefined,
        smtpFromEmail: form.smtpFromEmail || undefined,
      });
      applySmtp(await trpc.user.getSmtpConfig.query());
      toast.success(t('settings.smtp.saved'));
    } catch (error) {
      console.error('Failed to update SMTP config:', error);
      toast.danger(getErrorMessage(error, t('settings.smtp.saveFailed')));
    } finally {
      saving = false;
    }
  }

  function openDeleteModal() {
    deleteModalOpen = true;
    deleteConfirmationText = '';
  }

  async function confirmDeleteAccount() {
    if (deleteConfirmationText !== 'DELETE') return;

    deleting = true;
    try {
      await trpc.user.deleteOwnAccount.mutate();
      authStore.logout();
    } catch (err) {
      logger.error({ err }, 'Failed to delete account');
      toast.danger(getErrorMessage(err, t('settings.delete.failed')));
      deleteModalOpen = false;
    } finally {
      deleting = false;
    }
  }

  onMount(async () => {
    theme = readTheme();
    const [smtp, status] = await Promise.allSettled([
      trpc.user.getSmtpConfig.query(),
      trpc.forfait.status.query(undefined, { context: QUIET }),
    ]);
    if (smtp.status === 'fulfilled') applySmtp(smtp.value);
    else console.error('Failed to fetch SMTP config:', smtp.reason);
    if (status.status === 'fulfilled') plan = status.value;
  });
</script>

<SettingsLayout
  {sections}
  active={page.params.section}
  backHref="/app/settings"
  title={i18n.t('settings.title')}
>
  {#snippet children(id)}
    {#if id === 'profile'}
      <ProfileSection name={name} email={user?.email} avatar={user?.avatarUrl ?? undefined} />
    {:else if id === 'preferences'}
      <PreferencesSection
        onLocaleChange={persistLocale}
        {theme}
        onThemeChange={changeTheme}
      />
    {:else if id === 'mail'}
      <MailTransportSettings />

      <SettingsSection title={t('settings.smtp.title')} description={t('settings.smtp.description')}>
        {#snippet actions()}
          <Button variant="secondary" onclick={handleTestSmtpConfig} disabled={testingSmtp || saving}>
            <iconify-icon icon="solar:test-tube-linear" width="16" height="16" class="block"></iconify-icon>
            {testingSmtp ? t('settings.smtp.testing') : t('settings.smtp.test')}
          </Button>
          <Button icon={icons.check} onclick={handleUpdateSmtpConfig} disabled={saving || !hasSmtpChanges}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        {/snippet}

        <SettingsRow stacked>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t('settings.smtp.host')} for="smtpHost">
              <Input id="smtpHost" type="text" bind:value={form.smtpHost} placeholder="smtp.gmail.com" />
            </Field>
            <Field label={t('settings.smtp.port')} for="smtpPort">
              <Input id="smtpPort" type="number" bind:value={form.smtpPort} placeholder="587" />
            </Field>
          </div>
        </SettingsRow>

        <SettingsRow label={t('settings.smtp.secure')} description={t('settings.smtp.secureHint')}>
          <Switch bind:checked={form.smtpSecure} aria-label={t('settings.smtp.secure')} />
        </SettingsRow>

        <SettingsRow stacked>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t('settings.smtp.user')} for="smtpUser">
              <Input id="smtpUser" type="text" bind:value={form.smtpUser} placeholder={t('settings.smtp.userPlaceholder')} />
            </Field>
            <Field label={t('settings.smtp.password')} for="smtpPass">
              <div class="relative">
                <Input
                  id="smtpPass"
                  type={showSmtpPass ? 'text' : 'password'}
                  bind:value={form.smtpPass}
                  placeholder="••••••••"
                  class="pr-12"
                />
                {#if form.smtpPass}
                  <button
                    type="button"
                    onclick={() => (showSmtpPass = !showSmtpPass)}
                    aria-label={showSmtpPass ? t('settings.smtp.hidePassword') : t('settings.smtp.showPassword')}
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
            <Field label={t('settings.smtp.fromName')} for="smtpFromName">
              <Input id="smtpFromName" type="text" bind:value={form.smtpFromName} placeholder={t('settings.smtp.fromNamePlaceholder')} />
            </Field>
            <Field label={t('settings.smtp.fromEmail')} for="smtpFromEmail">
              <Input id="smtpFromEmail" type="email" bind:value={form.smtpFromEmail} placeholder={t('settings.smtp.userPlaceholder')} />
            </Field>
          </div>
        </SettingsRow>
      </SettingsSection>
    {:else if id === 'subscription'}
      <SubscriptionSection
        plan={plan?.allowed ? plan.plans.join(' / ') : t('settings.subscription.none')}
        manageHref={SPACES_URL}
        upgradeHref={SPACES_URL}
        description={t('settings.subscription.description')}
      >
        <SettingsRow label={t('settings.subscription.gloutonAccess')}>
          <Badge tone={plan?.allowed ? 'success' : 'neutral'}>{plan?.allowed ? t('settings.subscription.included') : t('settings.subscription.notIncluded')}</Badge>
        </SettingsRow>
        <SettingsRow label={t('settings.subscription.aiAccess')}>
          <Badge tone={plan?.aiAccess ? 'success' : 'neutral'}>{plan?.aiAccess ? t('settings.subscription.included') : t('settings.subscription.notIncluded')}</Badge>
        </SettingsRow>
      </SubscriptionSection>
    {:else if id === 'advanced'}
      <DangerZone>
        <SettingsRow label={t('settings.delete.label')} description={t('settings.delete.description')}>
          <Button variant="ghost-danger" icon={icons.remove} onclick={openDeleteModal} disabled={deleting}>
            {deleting ? t('settings.delete.deleting') : t('settings.delete.label')}
          </Button>
        </SettingsRow>
      </DangerZone>
    {/if}
  {/snippet}
</SettingsLayout>

<Modal bind:open={deleteModalOpen} title={t('settings.delete.title')} size="md">
  <p class="text-fc-sm text-fc-fg-muted">{t('settings.delete.body')}</p>

  <Field label={t('settings.delete.typeToConfirm')} for="deleteConfirm">
    <Input id="deleteConfirm" type="text" bind:value={deleteConfirmationText} placeholder="DELETE" />
  </Field>

  {#snippet footer()}
    <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="ghost" onclick={() => (deleteModalOpen = false)}>{t('common.cancel')}</Button>
      <Button
        variant="ghost-danger"
        onclick={confirmDeleteAccount}
        disabled={deleteConfirmationText !== 'DELETE' || deleting}
      >
        {deleting ? t('settings.delete.deleting') : t('common.confirm')}
      </Button>
    </div>
  {/snippet}
</Modal>
