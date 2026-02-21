import { teamContextStore, type TeamContext } from '$lib/stores/team-context.svelte';

export function useTeamContext() {
  const context = $derived(teamContextStore.context);
  const teamId = $derived(teamContextStore.getTeamId());
  const isPersonal = $derived(teamContextStore.isPersonal());
  const canManageTeam = $derived(teamContextStore.canManageTeam());
  const role = $derived(teamContextStore.getRole());
  const name = $derived(teamContextStore.getName());

  return {
    get context(): TeamContext {
      return context;
    },
    get teamId(): string | undefined {
      return teamId;
    },
    get isPersonal(): boolean {
      return isPersonal;
    },
    get canManageTeam(): boolean {
      return canManageTeam;
    },
    get role(): 'OWNER' | 'ADMIN' | 'MEMBER' | undefined {
      return role;
    },
    get name(): string {
      return name;
    },
    setPersonal: () => teamContextStore.setPersonal(),
    setTeam: (teamId: string, name: string, role: 'OWNER' | 'ADMIN' | 'MEMBER') =>
      teamContextStore.setTeam(teamId, name, role),
  };
}
