<script lang="ts">
  import { Button, Field, IconButton, Icon, Input, Textarea } from '@facile/muse';
  import { useT } from '$lib/i18n';
  import type { Objection } from './labels';

  let { items = $bindable() }: { items: Objection[] } = $props();
  const t = useT();
</script>

<div class="flex flex-col gap-3">
  {#each items as item, index (index)}
    <div class="flex flex-col gap-3 rounded-fc-md bg-fc-surface p-3">
      <div class="flex items-end gap-2">
        <Field label={t('competitors.objection')} class="min-w-0 flex-1">
          <Input bind:value={item.objection} maxlength={500} />
        </Field>
        <IconButton variant="ghost" aria-label={t('competitors.removeObjection')} onclick={() => items.splice(index, 1)}>
          <Icon icon="solar:trash-bin-minimalistic-linear" />
        </IconButton>
      </div>
      <Field label={t('competitors.response')}><Textarea bind:value={item.response} rows={2} maxlength={2000} /></Field>
      <Field label={t('competitors.proof')}><Input bind:value={item.proof} maxlength={1000} /></Field>
    </div>
  {/each}
  <div>
    <Button variant="ghost" size="sm" icon="mdi:plus" onclick={() => items.push({ objection: '', response: '', proof: '' })}>
      {t('competitors.addObjection')}
    </Button>
  </div>
</div>
