<script lang="ts">
  import { Button, Icon } from '@facile/muse';
  import { useT } from '$lib/i18n';
  import { marks } from './icons';

  interface Props {
    show: boolean;
    compact: boolean;
    lead: string;
  }

  let { show, compact, lead }: Props = $props();

  const t = useT();
</script>

<div class="toast" class:on={show} class:compact aria-hidden={!show}>
  <span class="mark"><Icon icon={marks.ardoise} size={20} /></span>
  <span class="flex min-w-0 flex-1 flex-col gap-0.5">
    <span class="truncate text-fc-sm font-bold text-fc-fg">{t('contacts.clientCreated')}</span>
    <span class="truncate text-fc-xs text-fc-fg-muted">{lead}</span>
  </span>
  {#if !compact}<Button size="sm" variant="secondary" tabindex={-1}>{t('contacts.openArdoise')}</Button>{/if}
</div>

<style>
  .toast {
    position: absolute;
    right: 28px;
    bottom: 22px;
    left: 28px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: var(--radius-fc-lg);
    background: var(--color-fc-surface);
    opacity: 0;
    transform: translateY(12px);
    transition:
      opacity 0.35s ease,
      transform 0.35s ease;
  }

  .compact {
    right: 16px;
    bottom: 16px;
    left: 16px;
  }

  .on {
    opacity: 1;
    transform: none;
  }

  .mark {
    display: flex;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-fc-md);
    background: var(--color-fc-component);
    color: var(--color-fc-fg);
  }
</style>
