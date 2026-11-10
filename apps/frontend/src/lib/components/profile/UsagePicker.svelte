<script lang="ts">
  import { Badge, Checkbox, Icon } from '@facile/muse';
  import { useT } from '$lib/i18n';
  import { COMING_SOON, USAGE_ICONS, USAGE_ORDER, type Usage } from '$lib/usage/nav';

  let { usages = $bindable(), label }: { usages: Usage[]; label: string } = $props();

  const t = useT();

  function toggle(usage: Usage, on: boolean) {
    usages = on ? USAGE_ORDER.filter((entry) => entry === usage || usages.includes(entry)) : usages.filter((entry) => entry !== usage);
  }
</script>

<fieldset class="flex w-full flex-col gap-3">
  <legend class="mb-3 text-fc-sm font-medium text-fc-fg">{label}</legend>
  <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
    {#each USAGE_ORDER as usage (usage)}
      {@const soon = COMING_SOON.has(usage)}
      <div
        class="flex min-h-16 items-start gap-3 rounded-fc-lg p-4 transition-colors {usages.includes(usage) ? 'bg-fc-accent/25' : 'bg-fc-component'} {soon ? 'opacity-70' : ''}"
      >
        <Checkbox
          checked={usages.includes(usage)}
          disabled={soon}
          aria-label={t(`usage.${usage}.title`)}
          aria-describedby="usage-{usage}-text"
          onchange={(e) => toggle(usage, e.currentTarget.checked)}
        />
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="flex flex-wrap items-center gap-2 text-fc-sm font-medium text-fc-fg">
            <Icon icon={USAGE_ICONS[usage]} />
            {t(`usage.${usage}.title`)}
            {#if soon}<Badge tone="info" class="shrink-0">{t('usage.soon')}</Badge>{/if}
          </span>
          <span id="usage-{usage}-text" class="text-fc-xs text-fc-fg-muted">{t(`usage.${usage}.text`)}</span>
        </div>
      </div>
    {/each}
  </div>
</fieldset>
