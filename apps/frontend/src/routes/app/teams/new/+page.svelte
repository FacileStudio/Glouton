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

<div
  class="p-6 lg:p-12 max-w-4xl mx-auto space-y-8 selection:text-black font-sans"
  style="background-color: #FAF7F5; selection-background-color: #FEC129;"
>
  <div class="flex items-center gap-4">
    <button
      onclick={handleCancel}
      class="w-12 h-12 flex items-center justify-center bg-white rounded-xl hover:bg-neutral-50 transition-colors border border-neutral-100"
    >
      <iconify-icon icon="solar:arrow-left-bold" width="20" class="text-neutral-700"></iconify-icon>
    </button>
    <div>
      <h1 class="text-3xl md:text-4xl font-black tracking-tight" style="color: #291334;">
        Créer une équipe
      </h1>
      <p class="text-neutral-500 font-medium text-base mt-1">
        Créez une nouvelle équipe pour collaborer avec vos collègues
      </p>
    </div>
  </div>

  <div class="p-8 md:p-10 rounded-2xl shadow-lg space-y-8" style="background-color: #EFEAE6;">
    <div class="space-y-6">
      <div class="space-y-2">
        <label for="name" class="text-sm font-bold text-neutral-700 block">
          Nom de l'équipe <span class="text-red-500">*</span>
        </label>
        <Input
          id="name"
          bind:value={formData.name}
          placeholder="Équipe Marketing"
          error={!!errors.name}
          class="rounded-xl"
        />
        {#if errors.name}
          <p class="text-red-500 text-xs font-medium">{errors.name}</p>
        {/if}
      </div>

      <div class="space-y-2">
        <label for="description" class="text-sm font-bold text-neutral-700 block">
          Description (optionnel)
        </label>
        <textarea
          id="description"
          bind:value={formData.description}
          placeholder="Décrivez l'objectif de cette équipe..."
          rows="4"
          class="w-full px-5 py-3 rounded-2xl bg-slate-50/50 border-2 border-slate-100 focus:border-brand-gold focus:bg-white hover:bg-white transition-all duration-200 font-medium text-brand-purple placeholder:text-slate-400 outline-none resize-none"
        ></textarea>
      </div>
    </div>

    <div class="pt-6 border-t border-neutral-200 flex items-center justify-end gap-3">
      <Button
        onclick={handleCancel}
        intent="secondary"
        size="lg"
        disabled={creating}
      >
        Annuler
      </Button>
      <Button
        onclick={handleSubmit}
        intent="primary"
        size="lg"
        disabled={creating || !formData.name.trim()}
      >
        {#if creating}
          <Spinner size="sm" />
          <span>Création...</span>
        {:else}
          <iconify-icon icon="solar:add-circle-bold" width="20"></iconify-icon>
          <span>Créer l'équipe</span>
        {/if}
      </Button>
    </div>
  </div>

  <div class="bg-blue-50 border border-blue-200 rounded-2xl p-6">
    <div class="flex gap-3">
      <iconify-icon icon="solar:info-circle-bold" width="24" class="text-blue-600 flex-shrink-0"></iconify-icon>
      <div>
        <h3 class="font-bold text-blue-900 mb-1">À propos des équipes</h3>
        <p class="text-blue-700 text-sm leading-relaxed">
          En créant une équipe, vous deviendrez automatiquement propriétaire. Vous pourrez inviter des membres,
          configurer les clés API et les paramètres SMTP pour l'équipe.
        </p>
      </div>
    </div>
  </div>
</div>
