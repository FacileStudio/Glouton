<script lang="ts">
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { Input, Button, Spinner, Alert } from '@repo/ui';
  import { toast } from '@repo/utils';
  import 'iconify-icon';

  let formData = $state({
    name: '',
    description: '',
  });

  let creating = $state(false);
  let errors = $state<{ name?: string; description?: string }>({});

  function validateForm(): boolean {
    errors = {};

    if (!formData.name || formData.name.trim().length < 3) {
      errors.name = 'Le nom de l\'équipe doit contenir au moins 3 caractères';
      return false;
    }

    return true;
  }

  async function handleSubmit() {
    if (!validateForm()) {
      toast.push('Veuillez corriger les erreurs du formulaire', 'error');
      return;
    }

    creating = true;
    try {
      const newTeam = await trpc.team.create.mutate({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
      });

      toast.push('Équipe créée avec succès !', 'success');
      goto(`/app/teams/${newTeam.id}`);
    } catch (error: any) {
      const errorMessage = error?.message || 'Échec de la création de l\'équipe';
      console.error('Error creating team:', error);
      toast.push(errorMessage, 'error');
    } finally {
      creating = false;
    }
  }

  function handleCancel() {
    goto('/app/teams');
  }
</script>

<div class="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
  <div class="flex items-center gap-3">
    <button
      aria-label="Annuler"
      onclick={handleCancel}
      class="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted"
    >
      <iconify-icon icon="solar:arrow-left-linear" width="16"></iconify-icon>
    </button>
    <div class="space-y-1">
      <h1 class="text-2xl font-bold tracking-tight text-foreground">Créer une équipe</h1>
      <p class="text-sm text-muted-foreground">
        Créez une nouvelle équipe pour collaborer avec vos collègues
      </p>
    </div>
  </div>

  <div class="rounded-xl border border-border bg-card p-6 space-y-6">
    <div class="space-y-4">
      <div class="space-y-1.5">
        <label for="name" class="text-sm font-medium text-foreground block">
          Nom de l'équipe <span class="text-destructive">*</span>
        </label>
        <Input
          id="name"
          bind:value={formData.name}
          placeholder="Équipe Marketing"
          error={!!errors.name}
        />
        {#if errors.name}
          <p class="text-xs text-destructive">{errors.name}</p>
        {/if}
      </div>

      <div class="space-y-1.5">
        <label for="description" class="text-sm font-medium text-foreground block">
          Description (optionnel)
        </label>
        <textarea
          id="description"
          bind:value={formData.description}
          placeholder="Décrivez l'objectif de cette équipe..."
          rows="4"
          class="w-full min-h-24 rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
        ></textarea>
      </div>
    </div>

    <div class="pt-4 border-t border-border flex items-center justify-end gap-2">
      <button
        onclick={handleCancel}
        disabled={creating}
        class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
      >
        Annuler
      </button>
      <button
        onclick={handleSubmit}
        disabled={creating || !formData.name.trim()}
        class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50"
      >
        {#if creating}
          <Spinner size="sm" />
          <span>Création...</span>
        {:else}
          <iconify-icon icon="mdi:plus-circle" width="16"></iconify-icon>
          <span>Créer l'équipe</span>
        {/if}
      </button>
    </div>
  </div>

  <div class="rounded-xl border border-border bg-card p-4">
    <div class="flex gap-3">
      <iconify-icon icon="solar:info-circle-linear" width="18" class="text-muted-foreground flex-shrink-0 mt-0.5"></iconify-icon>
      <div>
        <h3 class="text-sm font-semibold text-foreground mb-1">À propos des équipes</h3>
        <p class="text-sm text-muted-foreground">
          En créant une équipe, vous deviendrez automatiquement propriétaire. Vous pourrez inviter des membres,
          configurer les clés API et les paramètres SMTP pour l'équipe.
        </p>
      </div>
    </div>
  </div>
</div>
