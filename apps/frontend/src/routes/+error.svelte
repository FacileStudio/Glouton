<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Button, icons } from '@facile/muse';
  import { useT } from '$lib/i18n';

  const t = useT();

  const status = $derived(page.status);
  const message = $derived(page.error?.message || t('error.other.title'));

  function goHome() {
    goto(resolve('/'));
  }

  function goBack() {
    window.history.back();
  }
</script>

<div class="flex min-h-dvh items-center justify-center bg-fc-page px-4 text-fc-fg sm:px-6">
  <div class="mx-auto w-full max-w-md text-center">
    <p class="text-fc-sm text-fc-fg-muted">{t('error.label', { status })}</p>
    <h1 class="mt-2 font-fc-title text-fc-3xl font-semibold tracking-tight">
      {#if status === 404}
        {t('error.404.title')}
      {:else if status === 500}
        {t('error.500.title')}
      {:else}
        {t('error.other.title')}
      {/if}
    </h1>

    <p class="mx-auto mt-4 max-w-sm text-fc-sm leading-relaxed text-fc-fg-muted">
      {#if status === 404}
        {t('error.404.text')}
      {:else if status === 500}
        {t('error.500.text')}
      {:else}
        {message}
      {/if}
    </p>

    <div class="mt-8 flex flex-col items-center justify-center gap-2 sm:flex-row">
      <Button icon={icons.home} onclick={goHome} class="rounded-fc-md">{t('error.home')}</Button>
      <Button variant="secondary" icon="solar:arrow-left-linear" onclick={goBack} class="rounded-fc-md">
        {t('error.back')}
      </Button>
    </div>
  </div>
</div>
