<script lang="ts">
  import { getErrorMessage } from '$lib/utils/trpc-error';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { trpc } from '$lib/trpc';
  import { Alert, Button, Card, Field, Input, PageHeader, Textarea, icons, toast } from '@facile/muse';

  let formData = $state({
    name: '',
    description: '',
  });

  let creating = $state(false);
  let errors = $state<{ name?: string; description?: string }>({});

  function validateForm(): boolean {
    errors = {};

    if (!formData.name || formData.name.trim().length < 3) {
      errors.name = 'Le nom de l\'espace doit contenir au moins 3 caractères';
      return false;
    }

    return true;
  }

  async function handleSubmit() {
    if (!validateForm()) {
      toast.danger('Veuillez corriger les erreurs du formulaire');
      return;
    }

    creating = true;
    try {
      const newTeam = await trpc.team.create.mutate({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
      });

      toast.success('Espace créé avec succès !');
      goto(resolve('/app/teams/[teamId]', { teamId: newTeam.id }));
    } catch (error) {
      const errorMessage = getErrorMessage(error, 'Échec de la création de l\'espace');
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
    title="Créer un espace"
    description="Créez un nouvel espace pour collaborer avec vos collègues"
    back={{ href: '/app/teams', label: 'Espaces' }}
  />

  <Card class="flex flex-col gap-4">
    <Field label="Nom de l'espace *" for="name" error={errors.name}>
      <Input id="name" bind:value={formData.name} placeholder="Espace Marketing" required />
    </Field>

    <Field label="Description (optionnel)" for="description">
      <Textarea
        id="description"
        bind:value={formData.description}
        placeholder="Décrivez l'objectif de cet espace..."
        rows={4}
        class="min-h-24 resize-none"
      />
    </Field>

    <div class="flex flex-col-reverse gap-2 border-t border-fc-border pt-4 sm:flex-row sm:justify-end">
      <Button variant="ghost" onclick={handleCancel} disabled={creating}>Annuler</Button>
      <Button icon={icons.plus} onclick={handleSubmit} disabled={creating || !formData.name.trim()}>
        {creating ? 'Création...' : "Créer l'espace"}
      </Button>
    </div>
  </Card>

  <Alert tone="neutral" title="À propos des espaces">
    En créant un espace, vous deviendrez automatiquement propriétaire. Vous pourrez inviter des
    membres, configurer les clés API et les paramètres SMTP pour l'espace.
  </Alert>
</div>
