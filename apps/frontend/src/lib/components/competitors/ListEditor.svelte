<script lang="ts">
  import { Button, IconButton, Icon, Input } from '@facile/muse';
  import { useT } from '$lib/i18n';

  interface Props {
    items: string[];
    label: string;
  }

  let { items = $bindable(), label }: Props = $props();
  const t = useT();
</script>

<div class="flex flex-col gap-2">
  {#each items as _, index (index)}
    <div class="flex items-center gap-2">
      <Input bind:value={items[index]} aria-label="{label} {index + 1}" maxlength={500} />
      <IconButton variant="ghost" aria-label={t('competitors.removeLine')} onclick={() => items.splice(index, 1)}>
        <Icon icon="solar:trash-bin-minimalistic-linear" />
      </IconButton>
    </div>
  {/each}
  <div>
    <Button variant="ghost" size="sm" icon="mdi:plus" onclick={() => items.push('')}>{t('competitors.addLine')}</Button>
  </div>
</div>
