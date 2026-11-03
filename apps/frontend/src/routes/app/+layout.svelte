<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { SideBar, MobileNav, PageTransition, toast } from '@facile/muse';
  import authStore from '$lib/auth-store';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { ws } from '$lib/websocket';
  import trpc from '$lib/trpc';
  import { inboxCount } from '$lib/stores/inbox-count.svelte';

  type Team = { id: string; name: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' };

  let { children } = $props();

  let collapsed = $state(false);
  let teams = $state<Team[]>([]);

  function isActive(href: string) {
    return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
  }

  const navPages = $derived([
    { label: 'Chasses', icon: 'solar:radar-2-linear', href: '/app/hunts', active: isActive('/app/hunts') },
    { label: 'Contacts', icon: 'solar:users-group-two-rounded-linear', href: '/app/contacts', active: isActive('/app/contacts') },
    {
      label: inboxCount.value > 0 ? `Boîte agent (${inboxCount.value})` : 'Boîte agent',
      icon: 'solar:inbox-linear',
      href: '/app/inbox',
      active: isActive('/app/inbox'),
    },
    { label: 'Leads', icon: 'solar:magnet-linear', href: '/app/leads', active: isActive('/app/leads') },
    { label: 'Créations', icon: 'solar:buildings-2-linear', href: '/app/creations', active: isActive('/app/creations') },
    { label: 'Missions', icon: 'solar:case-round-linear', href: '/app/missions', active: isActive('/app/missions') },
    { label: 'Prospection', icon: 'solar:letter-linear', href: '/app/outreach', active: isActive('/app/outreach') },
    { label: 'Espaces', icon: 'solar:users-group-rounded-linear', href: '/app/teams', active: isActive('/app/teams') },
  ]);

  const navUser = $derived(
    $authStore.user
      ? {
          name: $authStore.user.firstName?.trim() || $authStore.user.email,
          avatar: $authStore.user.avatarUrl ?? undefined,
        }
      : undefined,
  );
  const settingsActive = $derived(isActive('/app/settings'));
  const activeSpaceId = $derived(
    teamContextStore.context.type === 'team' ? teamContextStore.context.teamId : null,
  );

  function getPageTitle(path: string): string {
    if (path.startsWith('/app/hunts/new')) return 'Nouvelle chasse · Glouton';
    if (path.match(/^\/app\/hunts\/.+/)) return 'Chasse · Glouton';
    if (path === '/app/hunts') return 'Chasses · Glouton';
    if (path.match(/^\/app\/leads\/.+/)) return 'Lead · Glouton';
    if (path === '/app/leads') return 'Leads · Glouton';
    if (path.startsWith('/app/contacts/companies/')) return 'Entreprise · Glouton';
    if (path.startsWith('/app/contacts/people/')) return 'Personne · Glouton';
    if (path === '/app/contacts') return 'Contacts · Glouton';
    if (path === '/app/inbox') return 'Boîte agent · Glouton';
    if (path === '/app/creations') return 'Créations · Glouton';
    if (path.startsWith('/app/missions')) return 'Missions · Glouton';
    if (path === '/app/outreach') return 'Prospection · Glouton';
    if (path === '/app/teams/new') return 'Nouvel espace · Glouton';
    if (path.match(/^\/app\/teams\/.+\/settings/)) return "Paramètres d'espace · Glouton";
    if (path.match(/^\/app\/teams\/.+\/members/)) return 'Membres · Glouton';
    if (path.match(/^\/app\/teams\/.+/)) return 'Espace · Glouton';
    if (path === '/app/teams') return 'Espaces · Glouton';
    if (path === '/app/settings') return 'Paramètres · Glouton';
    return 'Glouton';
  }

  const pageTitle = $derived(getPageTitle(page.url.pathname));

  function selectSpace(id: string | null) {
    if (id === null) {
      teamContextStore.setPersonal();
    } else {
      const team = teams.find((t) => t.id === id);
      if (!team) return;
      teamContextStore.setTeam(team.id, team.name, team.role);
    }
    window.location.reload();
  }

  let connectionState = ws.connectionState;
  const offInbox = [
    ws.on('draft:new', () => inboxCount.refresh()),
    ws.on('suggestion:new', () => inboxCount.refresh()),
  ];

  onMount(async () => {
    const token = $authStore.session?.token;
    if (token) ws.connect(token);
    inboxCount.refresh();
    try {
      teams = await trpc.team.list.query();
      if (activeSpaceId && !teams.some((t) => t.id === activeSpaceId)) {
        teamContextStore.setPersonal();
        window.location.reload();
      }
    } catch {
      toast.danger('Échec du chargement des espaces');
    }
  });

  onDestroy(() => {
    offInbox.forEach((off) => off());
    ws.disconnect();
  });

  $effect(() => {
    if (browser && $authStore.user && $authStore.session?.token) {
      const token = $authStore.session.token;
      const currentState = $connectionState;

      if (currentState === 'disconnected' || currentState === 'failed') {
        ws.connect(token);
      }
    }
  });
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="flex h-dvh w-full overflow-hidden bg-fc-page text-fc-fg">
  <div class="hidden h-full shrink-0 p-3 md:block">
    <SideBar
      class="h-full"
      icon="solar:magnet-wave-bold-duotone"
      title="Glouton"
      bind:collapsed
      pages={navPages}
      user={navUser}
      userHref="/app/settings"
      userActive={settingsActive}
      spaces={teams}
      {activeSpaceId}
      onSpaceSelect={selectSpace}
      manageSpacesHref="/app/teams"
      personalSpaceLabel="Personnel"
      manageSpacesLabel="Gérer les espaces"
    />
  </div>
  <main class="min-w-0 flex-1 overflow-auto overscroll-contain pb-28 md:pb-0">
    <div
      class="mx-auto flex w-full max-w-fc-xl flex-col gap-10 px-4 py-8 sm:px-6 md:px-10 md:pt-24 md:pb-10"
    >
      <PageTransition key={page.url.pathname}>
        {@render children()}
      </PageTransition>
    </div>
  </main>
  <MobileNav
    items={navPages}
    user={navUser}
    profileHref="/app/settings"
    profileActive={settingsActive}
  />
</div>
