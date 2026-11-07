<script lang="ts">
  import { page } from '$app/state';
  import { Alert, AuthScreen, LOCALE_COOKIE, type Locale } from '@facile/muse';
  import { useT } from '$lib/i18n';
  import type { Key } from '$lib/i18n/rows';

  const t = useT();
  const codes = ['unverified_account', 'email_unverified', 'identity_conflict', 'sso_failed'];
  const code = $derived(page.url.searchParams.get('sso_error') ?? '');
  const ssoError = $derived(codes.includes(code) ? t(`auth.error.${code}` as Key) : '');

  function rememberLocale(locale: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  }
</script>

<svelte:head>
  <title>{t('app.name')}</title>
</svelte:head>

<AuthScreen appName={t('app.name')} href="/auth/oidc" onLocaleChange={rememberLocale}>
  {#snippet tagline()}
    {t('landing.tagline')}
  {/snippet}
  {#snippet notice()}
    {#if ssoError}
      <Alert tone="danger">{ssoError}</Alert>
    {/if}
  {/snippet}
</AuthScreen>
