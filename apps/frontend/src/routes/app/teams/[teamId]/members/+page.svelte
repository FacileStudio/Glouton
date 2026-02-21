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
      toast.push(error?.message || 'Échec du chargement de l\'équipe', 'error');
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

  function getRoleBadgeColor(role: string) {
    switch (role) {
      case 'OWNER':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'ADMIN':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      default:
        return 'bg-neutral-100 text-neutral-700 border-neutral-200';
    }
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
      toast.push('Le propriétaire ne peut pas quitter l\'équipe. Supprimez l\'équipe ou transférez la propriété.', 'error');
      return;
    }

    leavingTeam = true;
    try {
      await trpc.team.leave.mutate({ teamId });
      toast.push('Vous avez quitté l\'équipe', 'success');
      goto('/app/teams');
    } catch (error: any) {
      toast.push(error?.message || 'Échec du départ de l\'équipe', 'error');
      leaveConfirmModalOpen = false;
    } finally {
      leavingTeam = false;
    }
  }

  function handleBack() {
    goto(`/app/teams/${teamId}`);
  }
</script>

<div
  class="p-6 lg:p-12 max-w-[1600px] mx-auto space-y-12 selection:text-black font-sans"
  style="background-color: #FAF7F5; selection-background-color: #FEC129;"
>
  {#if loading}
    <div class="flex items-center justify-center py-20">
      <Spinner size="lg" />
    </div>
  {:else if team}
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div class="flex items-center gap-4">
        <button
          onclick={handleBack}
          class="w-12 h-12 flex items-center justify-center bg-white rounded-xl hover:bg-neutral-50 transition-colors border border-neutral-100"
        >
          <iconify-icon icon="solar:arrow-left-bold" width="20" class="text-neutral-700"></iconify-icon>
        </button>
        <div>
          <h1 class="text-3xl md:text-4xl font-black tracking-tight" style="color: #291334;">
            Membres de {team.name}
          </h1>
          <p class="text-neutral-500 font-medium text-base mt-1">
            {members.length} membre{members.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        {#if !isOwner}
          <button
            onclick={() => (leaveConfirmModalOpen = true)}
            class="bg-red-100 text-red-700 px-6 py-4 rounded-xl font-bold hover:bg-red-200 active:scale-95 transition-all flex items-center gap-3 border border-red-200"
          >
            <iconify-icon icon="solar:logout-2-bold" width="20"></iconify-icon>
            <span>Quitter l'équipe</span>
          </button>
        {/if}

        {#if canManage}
          <button
            onclick={() => (addMemberModalOpen = true)}
            class="bg-black text-white px-8 py-4 rounded-xl font-bold hover:bg-neutral-800 active:scale-95 transition-all flex items-center gap-3 shadow-lg shadow-black/20"
          >
            <iconify-icon icon="mdi:account-plus" width="20"></iconify-icon>
            <span>Ajouter un membre</span>
          </button>
        {/if}
      </div>
    </div>

    <div class="rounded-2xl overflow-hidden shadow-lg" style="background-color: #EFEAE6;">
      {#if loadingMembers}
        <div class="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      {:else if members.length === 0}
        <div class="p-12">
          <EmptyState
            title="Aucun membre"
            description="Ajoutez des membres pour collaborer sur cette équipe"
            icon="solar:users-group-rounded-bold"
          >
            <div slot="action">
              {#if canManage}
                <Button onclick={() => (addMemberModalOpen = true)} intent="primary" size="lg">
                  <iconify-icon icon="mdi:account-plus" width="20"></iconify-icon>
                  Ajouter un membre
                </Button>
              {/if}
            </div>
          </EmptyState>
        </div>
      {:else}
        <div class="p-8">
          <div class="space-y-4">
            {#each members as member (member.id)}
              <div class="bg-white rounded-2xl p-6 shadow-sm border border-neutral-100 flex items-center justify-between gap-4">
                <div class="flex items-center gap-4 flex-1 min-w-0">
                  <div class="w-12 h-12 bg-neutral-900 rounded-xl flex items-center justify-center text-white font-black text-sm flex-shrink-0">
                    {getInitials(member.firstName, member.lastName, member.email)}
                  </div>

                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-3 mb-1">
                      <h3 class="font-bold text-neutral-900 truncate">
                        {#if member.firstName && member.lastName}
                          {member.firstName} {member.lastName}
                        {:else if member.firstName}
                          {member.firstName}
                        {:else}
                          {member.email}
                        {/if}
                      </h3>
                      <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold uppercase border flex-shrink-0 {getRoleBadgeColor(member.role)}">
                        {getRoleLabel(member.role)}
                      </span>
                    </div>
                    <p class="text-sm text-neutral-500 truncate">{member.email}</p>
                    <p class="text-xs text-neutral-400 mt-1">
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
                      class="px-3 py-2 rounded-xl border border-neutral-200 text-sm font-medium bg-white hover:bg-neutral-50 transition-colors disabled:opacity-50"
                    >
                      <option value="MEMBER">Membre</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  {/if}

                  {#if canManage && member.role !== 'OWNER'}
                    <button
                      onclick={() => openRemoveConfirm(member)}
                      disabled={removingMemberId === member.userId}
                      class="w-10 h-10 flex items-center justify-center rounded-xl text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      aria-label="Retirer le membre"
                    >
                      {#if removingMemberId === member.userId}
                        <Spinner size="sm" />
                      {:else}
                        <iconify-icon icon="solar:trash-bin-trash-bold" width="20"></iconify-icon>
                      {/if}
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<Modal bind:open={addMemberModalOpen} title="Ajouter un membre">
  <div class="space-y-6">
    <div class="space-y-2">
      <label for="memberEmail" class="text-sm font-bold text-neutral-700 block">
        Adresse email
      </label>
      <Input
        id="memberEmail"
        type="email"
        bind:value={addMemberEmail}
        placeholder="membre@exemple.com"
        class="rounded-xl"
      />
      <p class="text-xs text-neutral-500">
        L'utilisateur doit avoir un compte Glouton
      </p>
    </div>

    <div class="space-y-2">
      <label for="memberRole" class="text-sm font-bold text-neutral-700 block">
        Rôle
      </label>
      <select
        id="memberRole"
        bind:value={addMemberRole}
        class="w-full px-5 py-3 rounded-2xl bg-slate-50/50 border-2 border-slate-100 focus:border-brand-gold focus:bg-white hover:bg-white transition-all duration-200 font-medium text-brand-purple outline-none"
      >
        <option value="MEMBER">Membre</option>
        <option value="ADMIN">Admin</option>
      </select>
      <p class="text-xs text-neutral-500">
        Les admins peuvent gérer les membres et les paramètres
      </p>
    </div>

    <div class="flex items-center gap-3 pt-4">
      <Button
        onclick={() => { addMemberModalOpen = false; addMemberEmail = ''; }}
        intent="secondary"
        size="lg"
        class="flex-1"
        disabled={addingMember}
      >
        Annuler
      </Button>
      <Button
        onclick={handleAddMember}
        intent="primary"
        size="lg"
        class="flex-1"
        disabled={addingMember || !addMemberEmail.trim()}
      >
        {#if addingMember}
          <Spinner size="sm" />
          <span>Ajout...</span>
        {:else}
          <iconify-icon icon="mdi:account-plus" width="20"></iconify-icon>
          <span>Ajouter</span>
        {/if}
      </Button>
    </div>
  </div>
</Modal>

{#if removeConfirmModalOpen && memberToRemove}
  <div
    transition:fade={{ duration: 150 }}
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm"
  >
    <div class="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl space-y-6">
      <div class="space-y-2 text-center">
        <div class="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-500 mb-4">
          <iconify-icon icon="solar:user-cross-bold" width="32"></iconify-icon>
        </div>
        <h3 class="text-2xl font-black tracking-tight text-neutral-900">Retirer ce membre ?</h3>
        <p class="text-neutral-500 font-medium">
          {memberToRemove.firstName || memberToRemove.email} sera retiré de l'équipe et perdra l'accès aux ressources partagées.
        </p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <button
          onclick={() => { removeConfirmModalOpen = false; memberToRemove = null; }}
          class="px-4 py-3 rounded-xl font-bold bg-neutral-100 hover:bg-neutral-200 text-neutral-900 transition-colors"
        >
          Annuler
        </button>
        <button
          onclick={handleRemoveMember}
          disabled={!!removingMemberId}
          class="px-4 py-3 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm"
  >
    <div class="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl space-y-6">
      <div class="space-y-2 text-center">
        <div class="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto text-orange-500 mb-4">
          <iconify-icon icon="solar:logout-2-bold" width="32"></iconify-icon>
        </div>
        <h3 class="text-2xl font-black tracking-tight text-neutral-900">Quitter l'équipe ?</h3>
        <p class="text-neutral-500 font-medium">
          Vous perdrez l'accès aux ressources de cette équipe. Vous pourrez être réinvité par un administrateur.
        </p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <button
          onclick={() => (leaveConfirmModalOpen = false)}
          class="px-4 py-3 rounded-xl font-bold bg-neutral-100 hover:bg-neutral-200 text-neutral-900 transition-colors"
        >
          Annuler
        </button>
        <button
          onclick={handleLeaveTeam}
          disabled={leavingTeam}
          class="px-4 py-3 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {leavingTeam ? 'Départ...' : 'Quitter'}
        </button>
      </div>
    </div>
  </div>
{/if}
