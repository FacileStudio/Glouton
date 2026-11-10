<script lang="ts">
  import { Field, Input, Switch, Textarea } from '@facile/muse';
  import { useT } from '$lib/i18n';
  import type { ProfileForm } from './form';

  let { form = $bindable(), show = ['offer', 'website', 'area'] }: { form: ProfileForm; show?: Array<'offer' | 'website' | 'area'> } = $props();

  const t = useT();
</script>

<div class="flex w-full min-w-0 flex-col gap-4">
  {#if show.includes('offer')}
    <Field label={t('profile.offer')} helper={t('profile.example', { example: t('profile.offerExample') })} for="profile-offer" class="w-full">
      <Textarea
        id="profile-offer"
        rows={4}
        maxlength={4000}
        class="field-sizing-content min-h-32 max-h-[60vh] w-full"
        bind:value={form.offer}
        placeholder={t('profile.offerExample')}
      />
    </Field>
  {/if}
  {#if show.includes('website')}
    <Field label={t('profile.website')} helper={t('profile.websiteHint')} for="profile-website" class="w-full">
      <Input id="profile-website" type="text" inputmode="url" maxlength={500} bind:value={form.website} placeholder="facile.studio" />
    </Field>
  {/if}
  {#if show.includes('area')}
    <div class="grid w-full grid-cols-1 items-end gap-4 md:grid-cols-[1fr_auto]">
      <Field label={t('profile.area')} helper={t('profile.example', { example: t('profile.areaExample') })} for="profile-area" class="w-full">
        <Input id="profile-area" type="text" maxlength={200} bind:value={form.area} placeholder={t('profile.areaExample')} />
      </Field>
      <div class="pb-6"><Switch label={t('profile.remote')} bind:checked={form.remote} /></div>
    </div>
  {/if}
</div>
