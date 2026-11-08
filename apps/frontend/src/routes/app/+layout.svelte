<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import {
    SideBar,
    MobileNav,
    PageTransition,
    toast,
    icons,
    getI18n,
      readTheme,
    type Theme,
    type UserMenuOptions,
  } from '@facile/muse';
  import { QUIET } from '@repo/trpc-client';
  import { SPACES_URL, persistLocale, persistTheme } from '$lib/preferences';
  import authStore from '$lib/auth-store';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { ws } from '$lib/websocket';
  import trpc from '$lib/trpc';
  import { useT } from '$lib/i18n';
  import { inboxCount } from '$lib/stores/inbox-count.svelte';

  const t = useT();
  const i18n = getI18n();

  type Team = { id: string; name: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' };

  let { children } = $props();

  let collapsed = $state(false);
  let teams = $state<Team[]>([]);

  function isActive(href: string) {
    return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
  }

  const navPages = $derived([
    { label: t('nav.hunts'), icon: 'solar:radar-2-linear', href: '/app/hunts', active: isActive('/app/hunts') },
    { label: t('nav.contacts'), icon: 'solar:users-group-two-rounded-linear', href: '/app/contacts', active: isActive('/app/contacts') },
    {
      label: inboxCount.value > 0 ? `${t('nav.inbox')} (${inboxCount.value})` : t('nav.inbox'),
      icon: 'solar:inbox-linear',
      href: '/app/inbox',
      active: isActive('/app/inbox'),
    },
    { label: t('nav.leads'), icon: 'solar:magnet-linear', href: '/app/leads', active: isActive('/app/leads') },
    { label: t('nav.competitors'), icon: 'solar:ranking-linear', href: '/app/competitors', active: isActive('/app/competitors') },
    { label: t('nav.creations'), icon: 'solar:buildings-2-linear', href: '/app/creations', active: isActive('/app/creations') },
    { label: t('nav.missions'), icon: 'solar:case-round-linear', href: '/app/missions', active: isActive('/app/missions') },
    { label: t('nav.outreach'), icon: 'solar:letter-linear', href: '/app/outreach', active: isActive('/app/outreach') },
    { label: t('nav.spaces'), icon: icons.space, href: '/app/teams', active: isActive('/app/teams') },
  ]);

  const activeSpaceName = $derived(
    teamContextStore.context.type === 'team' ? teamContextStore.context.name : t('nav.personal'),
  );

  const navUser = $derived(
    $authStore.user
      ? {
          name: $authStore.user.firstName?.trim() || $authStore.user.email,
          avatar: $authStore.user.avatarUrl ?? undefined,
          email: $authStore.user.email,
          secondary: activeSpaceName,
        }
      : undefined,
  );
  const settingsActive = $derived(isActive('/app/settings'));
  const activeSpaceId = $derived(
    teamContextStore.context.type === 'team' ? teamContextStore.context.teamId : null,
  );

  let theme = $state<Theme>(browser ? readTheme() : 'system');
  let plan = $state<{ allowed: boolean; plans: string[] } | null>(null);

  function changeTheme(next: Theme) {
    theme = next;
    persistTheme(next);
  }

  const userMenu = $derived<UserMenuOptions>({
    settingsHref: '/app/settings',
    subscription: { plan: plan?.allowed ? plan.plans.join(' / ') : t('settings.subscription.none'), href: SPACES_URL },
    helpHref: 'https://github.com/FacileStudio/Glouton/tree/main/docs',
    onSignOut: () => authStore.logout(),
    locale: i18n.locale,
    onLocaleChange: persistLocale,
    theme,
    onThemeChange: changeTheme,
  });

  function getPageTitle(path: string): string {
    const name = t('app.name');
    const title = (key: Parameters<typeof t>[0]) => `${t(key)} · ${name}`;
    if (path.startsWith('/app/hunts/new')) return title('title.newHunt');
    if (path.match(/^\/app\/hunts\/.+/)) return title('title.hunt');
    if (path === '/app/hunts') return title('nav.hunts');
    if (path.match(/^\/app\/leads\/.+/)) return title('title.lead');
    if (path === '/app/leads') return title('nav.leads');
    if (path.startsWith('/app/contacts/companies/')) return title('title.company');
    if (path.startsWith('/app/contacts/people/')) return title('title.person');
    if (path === '/app/contacts') return title('nav.contacts');
    if (path === '/app/inbox') return title('nav.inbox');
    if (path === '/app/competitors/compare') return title('title.compareCompetitors');
    if (path.startsWith('/app/competitors/')) return title('title.competitor');
    if (path === '/app/competitors') return title('nav.competitors');
    if (path === '/app/creations') return title('nav.creations');
    if (path.startsWith('/app/missions')) return title('nav.missions');
    if (path === '/app/outreach') return title('nav.outreach');
    if (path === '/app/teams/new') return title('title.newSpace');
    if (path.match(/^\/app\/teams\/.+\/settings/)) return title('title.spaceSettings');
    if (path.match(/^\/app\/teams\/.+\/members/)) return title('title.members');
    if (path.match(/^\/app\/teams\/.+/)) return title('title.space');
    if (path === '/app/teams') return title('nav.spaces');
    if (path === '/app/settings') return title('title.settings');
    if (path === '/app/paywall') return title('title.plan');
    return name;
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
    ws.on<{ count?: number }>('competitor-watch:digest', (data) => {
      if (!data.count) return;
      toast.info(t('watch.digestToast', { count: data.count }), {
        action: { label: t('watch.digestOpen'), onClick: () => void goto(resolve('/app/competitors')) },
      });
    }),
  ];

  onMount(async () => {
    const token = $authStore.session?.token;
    if (token) ws.connect(token);
    inboxCount.refresh();
    try {
      const teamId = activeSpaceId ?? undefined;
      plan = await trpc.forfait.status.query(teamId ? { teamId } : undefined, { context: QUIET });
    } catch {
      plan = null;
    }
    try {
      teams = await trpc.team.list.query();
      if (activeSpaceId && !teams.some((t) => t.id === activeSpaceId)) {
        teamContextStore.setPersonal();
        window.location.reload();
      }
    } catch {
      toast.danger(t('nav.spacesFailed'));
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
      pages={navPages.filter((p) => p.href !== '/app/teams')}
      user={navUser}
      userHref="/app/settings"
      userActive={settingsActive}
      {userMenu}
      spaces={teams}
      {activeSpaceId}
      onSpaceSelect={selectSpace}
      manageSpacesHref="/app/teams"
      personalSpaceLabel={t('nav.personal')}
      manageSpacesLabel={t('nav.manageSpaces')}
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
    {userMenu}
  />
</div>
