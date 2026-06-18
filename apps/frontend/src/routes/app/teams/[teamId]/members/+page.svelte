<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { Input, Button, Spinner, Modal, Alert, EmptyState } from '@repo/ui';
  import { toast } from '@repo/utils';
  import { fade } from 'svelte/transition';
  import 'iconify-icon';

  let teamId = $derived($page.params.teamId);
  let team = $state<any>(null);
  let members = $state<any[]>([]);
  let loading = $state(true);
  let loadingMembers = $state(true);

  let addMemberModalOpen = $state(false);
  let addMemberEmail = $state('');
  let addMemberRole = $state<'ADMIN' | 'MEMBER'>('MEMBER');
  let addingMember = $state(false);

  let removingMemberId = $state<string | null>(null);
  let removeConfirmModalOpen = $state(false);
  let memberToRemove = $state<any>(null);

  let updatingRoleMemberId = $state<string | null>(null);

  let leaveConfirmModalOpen = $state(false);
  let leavingTeam = $state(false);

  let canManage = $derived(team && (team.userRole === 'OWNER' || team.userRole === 'ADMIN'));
  let isOwner = $derived(team && team.userRole === 'OWNER');

  onMount(async () => {
    await Promise.all([loadTeam(), loadMembers()]);
  });

  async function loadTeam() {
    loading = true;
    try {
      team = await trpc.team.get.query({ teamId });
    } catch (error: any) {
      console.error('Error loading team:', error);
      toast.push(error?.message || 'Échec du chargement de l\'espace', 'error');
      goto('/app/teams');
    } finally {
      loading = false;
    }
  }

  async function loadMembers() {
    loadingMembers = true;
    try {
      const result = await trpc.team.getMembers.query({ teamId });
      members = result || [];
    } catch (error) {
      console.error('Error loading members:', error);
      toast.push('Échec du chargement des membres', 'error');
      members = [];
    } finally {
      loadingMembers = false;
    }
  }

  function getRoleBadgeColor(_role: string) {
    return 'bg-muted text-foreground';
  }

  function getRoleLabel(role: string) {
    switch (role) {
      case 'OWNER':
        return 'Propriétaire';
      case 'ADMIN':
        return 'Admin';
      default:
        return 'Membre';
    }
  }

  function getInitials(firstName: string | null, lastName: string | null, email: string) {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (firstName) {
      return firstName.substring(0, 2).toUpperCase();
    }
    return email.substring(0, 2).toUpperCase();
  }

  async function handleAddMember() {
    if (!canManage || !addMemberEmail.trim()) return;

    addingMember = true;
    try {
      await trpc.team.addMember.mutate({
        teamId,
        email: addMemberEmail.trim(),
        role: addMemberRole,
      });
      toast.push('Membre ajouté avec succès', 'success');
      addMemberModalOpen = false;
      addMemberEmail = '';
      addMemberRole = 'MEMBER';
      await loadMembers();
    } catch (error: any) {
      toast.push(error?.message || 'Échec de l\'ajout du membre', 'error');
    } finally {
      addingMember = false;
    }
  }

  function openRemoveConfirm(member: any) {
    memberToRemove = member;
    removeConfirmModalOpen = true;
  }

  async function handleRemoveMember() {
    if (!canManage || !memberToRemove) return;

    removingMemberId = memberToRemove.userId;
    try {
      await trpc.team.removeMember.mutate({
        teamId,
        userId: memberToRemove.userId,
      });
      toast.push('Membre retiré avec succès', 'success');
      removeConfirmModalOpen = false;
      memberToRemove = null;
      await loadMembers();
    } catch (error: any) {
      toast.push(error?.message || 'Échec du retrait du membre', 'error');
    } finally {
      removingMemberId = null;
    }
  }

  async function handleUpdateRole(member: any, newRole: 'ADMIN' | 'MEMBER') {
    if (!isOwner || member.role === newRole) return;

    updatingRoleMemberId = member.userId;
    try {
      await trpc.team.updateMemberRole.mutate({
        teamId,
        userId: member.userId,
        role: newRole,
      });
      toast.push('Rôle mis à jour avec succès', 'success');
      await loadMembers();
    } catch (error: any) {
      toast.push(error?.message || 'Échec de la mise à jour du rôle', 'error');
    } finally {
      updatingRoleMemberId = null;
    }
  }

  async function handleLeaveTeam() {
    if (isOwner) {
      toast.push('Le propriétaire ne peut pas quitter l\'espace. Supprimez l\'espace ou transférez la propriété.', 'error');
      return;
    }

    leavingTeam = true;
    try {
      await trpc.team.leave.mutate({ teamId });
      toast.push('Vous avez quitté l\'espace', 'success');
      goto('/app/teams');
    } catch (error: any) {
      toast.push(error?.message || 'Échec du départ de l\'espace', 'error');
      leaveConfirmModalOpen = false;
    } finally {
      leavingTeam = false;
    }
  }

  function handleBack() {
    goto(`/app/teams/${teamId}`);
  }
</script>

<div class="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
  {#if loading}
    <div class="flex items-center justify-center py-16">
      <Spinner size="lg" />
    </div>
  {:else if team}
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <button
          aria-label="Retour"
          onclick={handleBack}
          class="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted"
        >
          <iconify-icon icon="solar:arrow-left-linear" width="16"></iconify-icon>
        </button>
        <div class="space-y-1">
          <h1 class="text-2xl font-bold tracking-tight text-foreground">
            Membres de {team.name}
          </h1>
          <p class="text-sm text-muted-foreground">
            {members.length} membre{members.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        {#if !isOwner}
          <button
            onclick={() => (leaveConfirmModalOpen = true)}
            class="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <iconify-icon icon="solar:logout-2-linear" width="16"></iconify-icon>
            <span>Quitter l'espace</span>
          </button>
        {/if}

        {#if canManage}
          <button
            onclick={() => (addMemberModalOpen = true)}
            class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
          >
            <iconify-icon icon="mdi:account-plus" width="16"></iconify-icon>
            <span>Ajouter un membre</span>
          </button>
        {/if}
      </div>
    </div>

    <div class="rounded-xl border border-border bg-card overflow-hidden">
      {#if loadingMembers}
        <div class="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      {:else if members.length === 0}
        <div class="p-8">
          <EmptyState
            title="Aucun membre"
            description="Ajoutez des membres pour collaborer sur cet espace"
            icon="solar:users-group-rounded-linear"
          >
            <div slot="action">
              {#if canManage}
                <button
                  onclick={() => (addMemberModalOpen = true)}
                  class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
                >
                  <iconify-icon icon="mdi:account-plus" width="16"></iconify-icon>
                  Ajouter un membre
                </button>
              {/if}
            </div>
          </EmptyState>
        </div>
      {:else}
        <div class="divide-y divide-border">
          {#each members as member (member.id)}
            <div class="px-4 py-3 flex items-center justify-between gap-3">
              <div class="flex items-center gap-3 flex-1 min-w-0">
                <div class="size-9 rounded-lg border border-border bg-background flex items-center justify-center text-foreground text-sm font-medium flex-shrink-0">
                  {getInitials(member.firstName, member.lastName, member.email)}
                </div>

                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-0.5">
                    <h3 class="text-sm font-medium text-foreground truncate">
                      {#if member.firstName && member.lastName}
                        {member.firstName} {member.lastName}
                      {:else if member.firstName}
                        {member.firstName}
                      {:else}
                        {member.email}
                      {/if}
                    </h3>
                    <span class="rounded-full px-2.5 py-0.5 text-xs font-medium flex-shrink-0 {getRoleBadgeColor(member.role)}">
                      {getRoleLabel(member.role)}
                    </span>
                  </div>
                  <p class="text-xs text-muted-foreground truncate">{member.email}</p>
                  <p class="text-xs text-muted-foreground mt-0.5">
                    Rejoint le {new Date(member.joinedAt).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2 flex-shrink-0">
                {#if isOwner && member.role !== 'OWNER'}
                  <select
                    value={member.role}
                    onchange={(e) => handleUpdateRole(member, e.currentTarget.value as 'ADMIN' | 'MEMBER')}
                    disabled={updatingRoleMemberId === member.userId}
                    class="h-9 rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-50"
                  >
                    <option value="MEMBER">Membre</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                {/if}

                {#if canManage && member.role !== 'OWNER'}
                  <button
                    onclick={() => openRemoveConfirm(member)}
                    disabled={removingMemberId === member.userId}
                    class="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
                    aria-label="Retirer le membre"
                  >
                    {#if removingMemberId === member.userId}
                      <Spinner size="sm" />
                    {:else}
                      <iconify-icon icon="solar:trash-bin-trash-linear" width="16"></iconify-icon>
                    {/if}
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<Modal bind:open={addMemberModalOpen} title="Ajouter un membre">
  <div class="space-y-4">
    <div class="space-y-1.5">
      <label for="memberEmail" class="text-sm font-medium text-foreground block">
        Adresse email
      </label>
      <Input
        id="memberEmail"
        type="email"
        bind:value={addMemberEmail}
        placeholder="membre@exemple.com"
      />
      <p class="text-xs text-muted-foreground">
        L'utilisateur doit avoir un compte Glouton
      </p>
    </div>

    <div class="space-y-1.5">
      <label for="memberRole" class="text-sm font-medium text-foreground block">
        Rôle
      </label>
      <select
        id="memberRole"
        bind:value={addMemberRole}
        class="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
      >
        <option value="MEMBER">Membre</option>
        <option value="ADMIN">Admin</option>
      </select>
      <p class="text-xs text-muted-foreground">
        Les admins peuvent gérer les membres et les paramètres
      </p>
    </div>

    <div class="flex items-center justify-end gap-2 pt-2">
      <button
        onclick={() => { addMemberModalOpen = false; addMemberEmail = ''; }}
        disabled={addingMember}
        class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
      >
        Annuler
      </button>
      <button
        onclick={handleAddMember}
        disabled={addingMember || !addMemberEmail.trim()}
        class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50"
      >
        {#if addingMember}
          <Spinner size="sm" />
          <span>Ajout...</span>
        {:else}
          <iconify-icon icon="mdi:account-plus" width="16"></iconify-icon>
          <span>Ajouter</span>
        {/if}
      </button>
    </div>
  </div>
</Modal>

{#if removeConfirmModalOpen && memberToRemove}
  <div
    transition:fade={{ duration: 150 }}
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
  >
    <div class="rounded-xl border border-border bg-card p-6 max-w-md w-full space-y-4">
      <div class="space-y-1">
        <h3 class="text-lg font-semibold text-foreground">Retirer ce membre ?</h3>
        <p class="text-sm text-muted-foreground">
          {memberToRemove.firstName || memberToRemove.email} sera retiré de l'espace et perdra l'accès aux ressources partagées.
        </p>
      </div>

      <div class="flex items-center justify-end gap-2">
        <button
          onclick={() => { removeConfirmModalOpen = false; memberToRemove = null; }}
          class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
        >
          Annuler
        </button>
        <button
          onclick={handleRemoveMember}
          disabled={!!removingMemberId}
          class="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
        >
          {removingMemberId ? 'Retrait...' : 'Retirer'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if leaveConfirmModalOpen}
  <div
    transition:fade={{ duration: 150 }}
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
  >
    <div class="rounded-xl border border-border bg-card p-6 max-w-md w-full space-y-4">
      <div class="space-y-1">
        <h3 class="text-lg font-semibold text-foreground">Quitter l'espace ?</h3>
        <p class="text-sm text-muted-foreground">
          Vous perdrez l'accès aux ressources de cet espace. Vous pourrez être réinvité par un administrateur.
        </p>
      </div>

      <div class="flex items-center justify-end gap-2">
        <button
          onclick={() => (leaveConfirmModalOpen = false)}
          class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
        >
          Annuler
        </button>
        <button
          onclick={handleLeaveTeam}
          disabled={leavingTeam}
          class="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
        >
          {leavingTeam ? 'Départ...' : 'Quitter'}
        </button>
      </div>
    </div>
  </div>
{/if}
