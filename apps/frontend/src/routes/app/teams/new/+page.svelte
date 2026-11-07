<script lang="ts">
  import { getErrorMessage } from '$lib/utils/trpc-error';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { trpc } from '$lib/trpc';
  import { Alert, Button, Card, Field, Input, PageHeader, Textarea, icons, toast } from '@facile/muse';
  import { useT } from '$lib/i18n';

  const t = useT();
  let formData = $state({
    name: '',
    description: '',
  });

  let creating = $state(false);
  let errors = $state<{ name?: string; description?: string }>({});

  function validateForm(): boolean {
    errors = {};

    if (!formData.name || formData.name.trim().length < 3) {
      errors.name = t('teams.new.nameShort');
      return false;
    }

    return true;
  }

  async function handleSubmit() {
    if (!validateForm()) {
      toast.danger(t('teams.new.fixErrors'));
      return;
    }

    creating = true;
    try {
      const newTeam = await trpc.team.create.mutate({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
      });

      toast.success(t('teams.new.created'));
      goto(resolve('/app/teams/[teamId]', { teamId: newTeam.id }));
    } catch (error) {
      const errorMessage = getErrorMessage(error, t('teams.new.failed'));
      console.error('Error creating team:', error);
      toast.danger(errorMessage);
    } finally {
      creating = false;
    }
  }

  function handleCancel() {
    goto(resolve('/app/teams'));
  }
</script>

<div class="mx-auto flex w-full max-w-fc-md flex-col gap-10">
  <PageHeader
    title={t('teams.create')}
    description={t('teams.new.subtitle')}
    back={{ href: '/app/teams', label: t('teams.title') }}
  />

  <Card class="flex flex-col gap-4">
    <Field label={t('teams.new.name')} for="name" error={errors.name}>
      <Input id="name" bind:value={formData.name} placeholder={t('teams.new.namePlaceholder')} required />
    </Field>

    <Field label={t('teams.new.description')} for="description">
      <Textarea
        id="description"
        bind:value={formData.description}
        placeholder={t('teams.new.descriptionPlaceholder')}
        rows={4}
        class="min-h-24 resize-none"
      />
    </Field>

    <div class="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
      <Button variant="ghost" onclick={handleCancel} disabled={creating}>{t('common.cancel')}</Button>
      <Button icon={icons.plus} onclick={handleSubmit} disabled={creating || !formData.name.trim()}>
        {creating ? t('teams.new.creating') : t('teams.new.submit')}
      </Button>
    </div>
  </Card>

  <Alert tone="neutral" title={t('teams.new.aboutTitle')}>
    {t('teams.new.aboutText')}
  </Alert>
</div>
