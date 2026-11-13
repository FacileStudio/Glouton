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
    ideasNavItem,
    type UserMenuOptions,
  } from '@facile/muse';
  import { QUIET } from '@repo/trpc-client';
  import { SPACES_URL, persistLocale, theme } from '$lib/preferences';
  import authStore from '$lib/auth-store';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { ws } from '$lib/websocket';
  import trpc from '$lib/trpc';
  import { useT } from '$lib/i18n';
  import { inboxCount } from '$lib/stores/inbox-count.svelte';
  import { profileStore } from '$lib/stores/profile.svelte';
  import { ideasStore } from '$lib/stores/ideas.svelte';
  import { inSection, navFor } from '$lib/usage/nav';

  const t = useT();
  const i18n = getI18n();

  type Team = { id: string; name: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' };

  let { children } = $props();

  let collapsed = $state(false);
  let teams = $state<Team[]>([]);

  function isActive(href: string) {
    return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
  }

  const navPages = $derived(
    navFor(profileStore.usages()).map((section) => {
      const active = inSection(section, page.url.pathname);
      if (section.id === 'ideas') {
        return ideasNavItem({ href: section.href, active, count: ideasStore.count, running: ideasStore.running, i18n });
      }
      const label =
        section.id === 'messages' && inboxCount.value > 0 ? `${t(section.label)} (${inboxCount.value})` : t(section.label);
      return { label, icon: section.icon, href: section.href, active };
    }),
  );

  const OPEN_BEFORE_START = ['/app/start', '/app/settings', '/app/paywall', '/app/teams', '/app/pending'];

  $effect(() => {
    if (!profileStore.loaded || !profileStore.value || profileStore.value.onboarded) return;
    if (OPEN_BEFORE_START.some((path) => isActive(path))) return;
    void goto(resolve('/app/start'), { replaceState: true });
  });

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

  let plan = $state<{ allowed: boolean; plans: string[] } | null>(null);

  const userMenu = $derived<UserMenuOptions>({
    items: [{ label: t('nav.spaces'), icon: icons.space, href: '/app/teams' }],
    settingsHref: '/app/settings',
    subscription: { plan: plan?.allowed ? plan.plans.join(' / ') : t('settings.subscription.none'), href: SPACES_URL },
    helpHref: 'https://github.com/FacileStudio/Glouton/tree/main/docs',
    onSignOut: () => authStore.logout(),
    locale: i18n.locale,
    onLocaleChange: persistLocale,
    theme: theme.mode,
    onThemeChange: (next) => theme.set(next),
  });

  function getPageTitle(path: string): string {
    const name = t('app.name');
    const title = (key: Parameters<typeof t>[0]) => `${t(key)} · ${name}`;
    if (path === '/app/start') return title('start.title');
    if (path === '/app/ideas') return title('title.ideas');
    if (path === '/app/pending') return title('title.pending');
    if (path.startsWith('/app/hunts/new')) return title('title.newHunt');
    if (path === '/app/searches/schedules') return title('title.schedules');
    if (path.match(/^\/app\/hunts\/.+/)) return title('title.hunt');
    if (path === '/app/searches/hunts') return title('nav.hunts');
    if (path.match(/^\/app\/leads\/.+/)) return title('title.lead');
    if (path === '/app/prospects/leads') return title('nav.leads');
    if (path.startsWith('/app/contacts/companies/')) return title('title.company');
    if (path.startsWith('/app/contacts/people/')) return title('title.person');
    if (path === '/app/prospects/contacts') return title('nav.contacts');
    if (path === '/app/messages/inbox') return title('nav.inbox');
    if (path === '/app/competitors/compare') return title('title.compareCompetitors');
    if (path === '/app/competitors/suggestions') return title('discovery.title');
    if (path === '/app/competitors/monitoring') return title('nav.tab.monitoring');
    if (path.startsWith('/app/competitors/')) return title('title.competitor');
    if (path === '/app/competitors') return title('nav.competitors');
    if (path === '/app/prospects/creations') return title('nav.creations');
    if (path.startsWith('/app/missions') || path === '/app/prospects/missions') return title('nav.missions');
    if (path === '/app/messages/outreach') return title('nav.outreach');
    if (path === '/app/job/offers') return title('job.offers.title');
    if (path.startsWith('/app/job/applications/')) return title('title.application');
    if (path === '/app/job/applications') return title('job.applications.title');
    if (path === '/app/job/cv') return title('job.cv.title');
    if (path === '/app/teams/new') return title('title.newSpace');
    if (path.match(/^\/app\/teams\/.+\/settings/)) return title('title.spaceSettings');
    if (path.match(/^\/app\/teams\/.+\/members/)) return title('title.members');
    if (path.match(/^\/app\/teams\/.+/)) return title('title.space');
    if (path === '/app/teams') return title('nav.spaces');
    if (path.startsWith('/app/settings')) return title('title.settings');
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
    ws.on<{ created?: number }>('competitor-discovery:done', (data) => {
      if (!data?.created) return;
      toast.info(t('discovery.doneToast', { count: data.created }), {
        action: { label: t('discovery.openSuggestions'), onClick: () => void goto(resolve('/app/competitors/suggestions')) },
      });
    }),
    ws.on<{ count?: number }>('competitor:new-registered', (data) => {
      if (!data?.count) return;
      toast.info(t('discovery.registeredToast', { count: data.count }), {
        action: { label: t('discovery.openSuggestions'), onClick: () => void goto(resolve('/app/competitors/suggestions')) },
      });
    }),
    ws.on<{ name?: string; newLeads?: number }>('hunt-digest', (data) =>
      toast.success(t('schedules.digest', { name: data?.name ?? '', count: data?.newLeads ?? 0 }))
    ),
    ws.on<{ created?: number }>('job-search:done', (data) => {
      if (!data?.created) return;
      toast.info(t('job.search.doneToast', { count: data.created }), {
        action: { label: t('job.offers.open'), onClick: () => void goto(resolve('/app/job/offers')) },
      });
    }),
    ws.on<{ applicationId?: string; title?: string }>('job:reminder', (data) => {
      if (!data?.applicationId) return;
      const id = data.applicationId;
      toast.info(t('job.applications.reminderToast', { title: data.title ?? '' }), {
        action: { label: t('job.applications.open'), onClick: () => void goto(resolve('/app/job/applications/[id]', { id })) },
      });
    }),
    ws.on<{ name?: string }>('hunt-schedule-paused', (data) => toast.danger(t('schedules.pausedNotice', { name: data?.name ?? '' }))),
  ];

  onMount(async () => {
    const token = $authStore.session?.token;
    if (token) ws.connect(token);
    inboxCount.refresh();
    void profileStore.load(activeSpaceId ?? undefined);
    void ideasStore.load(activeSpaceId ?? undefined);
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
      pages={navPages}
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
