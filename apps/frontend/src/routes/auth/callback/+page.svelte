<script lang="ts">
  import { UserRole } from '@repo/types';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Spinner } from '@facile/muse';
  import authStore from '$lib/auth-store';
  import { useT } from '$lib/i18n';

  const t = useT();
  let failed = $state(false);

  function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
      const payload = token.split('.')[1];
      if (!payload) return null;
      const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  onMount(async () => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const token = hash.get('token');
    history.replaceState(null, '', window.location.pathname);

    const payload = token ? decodeJwtPayload(token) : null;
    if (!token || !payload?.id || !payload?.email) {
      failed = true;
      return;
    }

    authStore.setAuth(
      { token },
      {
        id: payload.id as string,
        email: payload.email as string,
        firstName: (payload.firstName as string) ?? '',
        lastName: (payload.lastName as string) ?? '',
        role: payload.role === UserRole.ADMIN ? UserRole.ADMIN : UserRole.USER,
        isPremium: Boolean(payload.isPremium),
        avatarUrl: (payload.avatarUrl as string | null) ?? null,
        coverImageUrl: null,
        locale: (payload.locale as string | null) ?? null,
      }
    );

    await goto(resolve('/app/leads'));
  });
</script>

<svelte:head>
  <title>{t('app.name')}</title>
</svelte:head>

<div class="flex min-h-dvh flex-col items-center justify-center gap-4 bg-fc-page px-4 text-fc-fg">
  {#if failed}
    <p role="alert" class="text-fc-sm text-fc-danger">{t('auth.callback.failed')}</p>
    <a
      href={resolve('/login')}
      class="text-fc-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring"
    >
      {t('auth.callback.back')}
    </a>
  {:else}
    <Spinner label={t('auth.callback.progress')} />
    <p class="text-fc-sm text-fc-fg-muted">{t('auth.callback.progress')}</p>
  {/if}
</div>
