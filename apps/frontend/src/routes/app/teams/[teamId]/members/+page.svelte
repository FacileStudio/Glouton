<script lang="ts">
  import type { RouterOutputs } from '@repo/trpc-client';

  type TeamMember = RouterOutputs['team']['getMembers'][number];
  import { getErrorMessage } from '$lib/utils/trpc-error';
  import { onMount } from 'svelte';
  import type { PageProps } from './$types';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { trpc } from '$lib/trpc';
  import {
    Avatar,
    Badge,
    Button,
    Card,
    ConfirmModal,
    EmptyState,
    Field,
    IconButton,
    Icon,
    Input,
    Modal,
    PageHeader,
    Select,
    Spinner,
    icons,
    toast,
  } from '@facile/muse';
  import { useFormat, useT } from '$lib/i18n';

  const t = useT();
  const format = useFormat();
  let { params }: PageProps = $props();
  let teamId = $derived(params.teamId);
  let team = $state<RouterOutputs['team']['get'] | null>(null);
  let members = $state<TeamMember[]>([]);
  let loading = $state(true);
  let loadingMembers = $state(true);

  let addMemberModalOpen = $state(false);
  let addMemberEmail = $state('');
  let addMemberRole = $state<'ADMIN' | 'MEMBER'>('MEMBER');
  let addingMember = $state(false);

  let removingMemberId = $state<string | null>(null);
  let removeConfirmModalOpen = $state(false);
  let memberToRemove = $state<TeamMember | null>(null);

  let updatingRoleMemberId = $state<string | null>(null);

  let leaveConfirmModalOpen = $state(false);

  let linked = $derived(Boolean(team?.registreSpaceId));
  let canManage = $derived(team && !linked && (team.userRole === 'OWNER' || team.userRole === 'ADMIN'));
  let isOwner = $derived(team && !linked && team.userRole === 'OWNER');

  onMount(async () => {
    await Promise.all([loadTeam(), loadMembers()]);
  });

  async function loadTeam() {
    loading = true;
    try {
      team = await trpc.team.get.query({ teamId });
    } catch (error) {
      console.error('Error loading team:', error);
      toast.danger(getErrorMessage(error, t('teams.loadOneFailed')));
      goto(resolve('/app/teams'));
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
      toast.danger(t('teams.membersLoadFailed'));
      members = [];
    } finally {
      loadingMembers = false;
    }
  }

  function getRoleTone(role: string): 'owner' | 'admin' | 'neutral' {
    if (role === 'OWNER') return 'owner';
    if (role === 'ADMIN') return 'admin';
    return 'neutral';
  }

  function getRoleLabel(role: string) {
    switch (role) {
      case 'OWNER':
        return t('teams.role.owner');
      case 'ADMIN':
        return t('teams.role.admin');
      default:
        return t('teams.role.member');
    }
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
      toast.success(t('teams.memberAdded'));
      addMemberModalOpen = false;
      addMemberEmail = '';
      addMemberRole = 'MEMBER';
      await loadMembers();
    } catch (error) {
      toast.danger(getErrorMessage(error, t('teams.memberAddFailed')));
    } finally {
      addingMember = false;
    }
  }

  function openRemoveConfirm(member: TeamMember) {
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
      toast.success(t('teams.memberRemoved'));
      removeConfirmModalOpen = false;
      memberToRemove = null;
      await loadMembers();
    } catch (error) {
      toast.danger(getErrorMessage(error, t('teams.memberRemoveFailed')));
    } finally {
      removingMemberId = null;
    }
  }

  async function handleUpdateRole(member: TeamMember, newRole: 'ADMIN' | 'MEMBER') {
    if (!isOwner || member.role === newRole) return;

    updatingRoleMemberId = member.userId;
    try {
      await trpc.team.updateMemberRole.mutate({
        teamId,
        userId: member.userId,
        role: newRole,
      });
      toast.success(t('teams.roleUpdated'));
      await loadMembers();
    } catch (error) {
      toast.danger(getErrorMessage(error, t('teams.roleUpdateFailed')));
    } finally {
      updatingRoleMemberId = null;
    }
  }

  async function handleLeaveTeam() {
    if (isOwner) {
      toast.danger(t('teams.ownerCannotLeave'));
      return;
    }
    try {
      await trpc.team.leave.mutate({ teamId });
      toast.success(t('teams.left'));
      goto(resolve('/app/teams'));
    } catch (error) {
      toast.danger(getErrorMessage(error, t('teams.leaveFailed')));
      leaveConfirmModalOpen = false;
    }
  }

  function cancelAddMember() {
    addMemberModalOpen = false;
    addMemberEmail = '';
  }

  function cancelRemoveMember() {
    removeConfirmModalOpen = false;
    memberToRemove = null;
  }
</script>

{#if loading}
  <div class="flex items-center justify-center py-16">
    <Spinner size="lg" label={t('teams.loadingOne')} />
  </div>
{:else if team}
  <PageHeader
    title={t('teams.membersOf', { name: team.name })}
    description={t('teams.memberCount', { count: members.length })}
    back={{ href: `/app/teams/${teamId}`, label: team.name }}
  >
    {#snippet actions()}
      {#if team}
        {#if linked && team.manageUrl}
          <Button variant="outline" icon={icons.space} href={team.manageUrl}>{t('teams.manage')}</Button>
        {:else if team.userRole !== 'OWNER'}
          <Button variant="ghost-danger" icon={icons.logout} onclick={() => (leaveConfirmModalOpen = true)}>
            {t('teams.leave')}
          </Button>
        {/if}
        {#if canManage}
          <Button icon={icons.plus} onclick={() => (addMemberModalOpen = true)}>{t('teams.addMember')}</Button>
        {/if}
      {/if}
    {/snippet}
  </PageHeader>

  {#if loadingMembers}
    <div class="flex items-center justify-center py-16">
      <Spinner size="lg" label={t('teams.loadingMembers')} />
    </div>
  {:else if members.length === 0}
    <Card>
      <EmptyState
        title={t('teams.noMembers')}
        description={t('teams.noMembersText')}
        icon={icons.usersGroup}
      >
        {#if canManage}
          <Button icon={icons.plus} onclick={() => (addMemberModalOpen = true)}>{t('teams.addMember')}</Button>
        {/if}
      </EmptyState>
    </Card>
  {:else}
    <Card class="overflow-hidden p-0">
      <ul class="flex flex-col gap-1">
        {#each members as member (member.id)}
          <li class="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex min-w-0 flex-1 items-center gap-3">
              <Avatar
                src={member.avatarUrl ?? undefined}
                name={[member.firstName, member.lastName].filter(Boolean).join(' ') || member.email}
                size="sm"
              />

              <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                <div class="flex items-center gap-2">
                  <h3 class="truncate text-fc-sm font-medium text-fc-fg">
                    {#if member.firstName && member.lastName}
                      {member.firstName} {member.lastName}
                    {:else if member.firstName}
                      {member.firstName}
                    {:else}
                      {member.email}
                    {/if}
                  </h3>
                  <Badge tone={getRoleTone(member.role)} class="shrink-0">{getRoleLabel(member.role)}</Badge>
                </div>
                <p class="truncate text-fc-xs text-fc-fg-muted">{member.email}</p>
                <p class="text-fc-xs text-fc-fg-muted">
                  {t('teams.joinedOn', { date: format.date(member.joinedAt) })}
                </p>
              </div>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              {#if isOwner && member.role !== 'OWNER'}
                <Select
                  value={member.role}
                  onchange={(e) => handleUpdateRole(member, e.currentTarget.value as 'ADMIN' | 'MEMBER')}
                  disabled={updatingRoleMemberId === member.userId}
                  aria-label={t('teams.roleOf', { email: member.email })}
                  class="w-36"
                >
                  <option value="MEMBER">{t('teams.role.member')}</option>
                  <option value="ADMIN">{t('teams.role.admin')}</option>
                </Select>
              {/if}

              {#if canManage && member.role !== 'OWNER'}
                <IconButton
                  variant="danger"
                  onclick={() => openRemoveConfirm(member)}
                  disabled={removingMemberId === member.userId}
                  aria-label={t('teams.removeMember')}
                >
                  {#if removingMemberId === member.userId}
                    <Spinner size="sm" label={t('teams.removing')} />
                  {:else}
                    <Icon icon={icons.remove} size={18} />
                  {/if}
                </IconButton>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </Card>
  {/if}
{/if}

<Modal bind:open={addMemberModalOpen} title={t('teams.addMember')}>
  <Field label={t('teams.emailAddress')} helper={t('teams.mustHaveAccount')} for="memberEmail">
    <Input id="memberEmail" type="email" bind:value={addMemberEmail} placeholder={t('teams.memberEmailPlaceholder')} />
  </Field>

  <Field label={t('teams.roleLabel')} helper={t('teams.roleHelper')} for="memberRole">
    <Select id="memberRole" bind:value={addMemberRole}>
      <option value="MEMBER">{t('teams.role.member')}</option>
      <option value="ADMIN">{t('teams.role.admin')}</option>
    </Select>
  </Field>

  {#snippet footer()}
    <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="ghost" onclick={cancelAddMember} disabled={addingMember}>{t('common.cancel')}</Button>
      <Button icon={icons.plus} onclick={handleAddMember} disabled={addingMember || !addMemberEmail.trim()}>
        {addingMember ? t('teams.adding') : t('common.add')}
      </Button>
    </div>
  {/snippet}
</Modal>

<ConfirmModal
  bind:open={removeConfirmModalOpen}
  tone="danger"
  title={t('teams.removeTitle')}
  description={t('teams.removeText', { name: memberToRemove?.firstName || memberToRemove?.email || t('teams.thisMember') })}
  confirmLabel={t('teams.remove')}
  cancelLabel={t('common.cancel')}
  onConfirm={handleRemoveMember}
  onCancel={cancelRemoveMember}
/>

<ConfirmModal
  bind:open={leaveConfirmModalOpen}
  tone="danger"
  title={t('teams.leaveTitle')}
  description={t('teams.leaveText')}
  confirmLabel={t('teams.leaveShort')}
  cancelLabel={t('common.cancel')}
  onConfirm={handleLeaveTeam}
/>
