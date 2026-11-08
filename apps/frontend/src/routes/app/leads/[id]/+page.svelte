<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import type { PageProps } from './$types';
  import { fade, fly } from 'svelte/transition';
  import { trpc } from '$lib/trpc';
  import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner, toast } from '@facile/muse';
  import { getFaviconUrl, handleFaviconError } from '$lib/utils/favicon';
  import LeadLocationMap from '$lib/components/leads/LeadLocationMap.svelte';
  import Composer, { type ComposerMessage } from '$lib/components/mail/Composer.svelte';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { useFormat, useT } from '$lib/i18n';
  import CloseLeadModal from '$lib/components/competitors/CloseLeadModal.svelte';

  const t = useT();
  const format = useFormat();
  let teamId = $derived(teamContextStore.getTeamId());

  interface SocialProfile {
    platform: string;
    url: string;
  }

  interface CompanyInfo {
    name?: string;
    description?: string;
    industry?: string;
    size?: string;
    founded?: string;
    website?: string;
  }

  interface Lead {
    id: string;
    domain: string | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    businessName: string | null;
    position: string | null;
    department: string | null;
    city: string | null;
    country: string | null;
    status: 'HOT' | 'WARM' | 'COLD';
    score: number;
    technologies: string[] | null;
    additionalEmails: string[] | null;
    phoneNumbers: string[] | null;
    physicalAddresses: string[];
    socialProfiles: SocialProfile[] | null;
    companyInfo: CompanyInfo | null;
    scrapedAt: string | null;
    auditedAt: string | null;
    contacted: boolean;
    lastContactedAt: string | null;
    emailsSentCount: number;
    emailVerified: boolean | null;
    emailVerifiedAt: string | null;
    emailVerificationMethod: string | null;
    coordinates: { lat: number; lng: number } | null;
    createdAt: string;
    outcome: 'WON' | 'LOST' | null;
    lossReason: string | null;
    lostToCompetitorId: string | null;
    wonAgainstCompetitorId: string | null;
  }

  interface EmailOutreach {
    id: string;
    leadId: string | null;
    userId: string;
    templateId: string | null;
    subject: string;
    htmlBody: string;
    textBody: string;
    variables: Record<string, string> | null;
    status: string;
    sentAt: string | null;
    openedAt?: string | null;
    clickedAt?: string | null;
    repliedAt?: string | null;
    error?: string | null;
    createdAt: string;
  }

  let lead = $state<Lead | null>(null);
  let outreachHistory = $state<EmailOutreach[]>([]);
  let loading = $state(true);
  const expandedEmails = new SvelteSet<string>();
  let composerOpen = $state(false);
  let isFavorite = $state(false);
  let togglingFavorite = $state(false);
  let closeOpen = $state(false);
  let competitors = $state<{ id: string; name: string; active: boolean }[]>([]);

  let { params }: PageProps = $props();
  let leadId = $derived(params.id);

  onMount(loadData);

  async function loadData() {
    loading = true;
    try {
      const currentTeamId = teamId;
      const [leadData, historyData, favoriteStatus, competitorList] = await Promise.all([
        trpc.lead.query.getById.query({ leadId }),
        trpc.email.getLeadOutreach.query({ leadId, teamId: currentTeamId }),
        trpc.lead.favorite.isFavorite.query({ leadId, teamId: currentTeamId }),
        trpc.competitor.list.query({ teamId: currentTeamId }).catch(() => ({ items: [] })),
      ]);
      competitors = competitorList.items.map((c) => ({ id: c.id, name: c.name, active: c.status === 'ACTIVE' }));

      lead = leadData;
      outreachHistory = [...historyData];
      isFavorite = favoriteStatus.isFavorite;
    } catch (error) {
      toast.danger(t('leads.detail.loadFailed'));
      console.error(error);
    } finally {
      loading = false;
    }
  }

  const competitorName = (id: string | null) => competitors.find((c) => c.id === id)?.name ?? '?';

  async function reopen() {
    try {
      await trpc.competitor.reopenLead.mutate({ leadId, teamId });
      toast.success(t('close.reopened'));
      await loadData();
    } catch (error) {
      toast.danger(t('leads.detail.loadFailed'));
      console.error(error);
    }
  }

  async function sendToLead(message: ComposerMessage) {
    await trpc.email.sendToLead.mutate({ teamId, leadId, subject: message.subject, text: message.text });
  }

  function formatDate(date: string | Date | null): string {
    if (!date) return t('leads.detail.never');
    return format.date(date, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function getStatusTone(status: string): 'danger' | 'neutral' {
    return status === 'FAILED' ? 'danger' : 'neutral';
  }

  function getPriorityTone(status: Lead['status']): 'danger' | 'neutral' {
    return status === 'HOT' ? 'danger' : 'neutral';
  }

  const rowLinkClass =
    'flex items-center gap-3 rounded-fc-md px-3 py-2.5 transition-colors hover:bg-fc-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring';

  function toggleEmailExpansion(emailId: string) {
    if (expandedEmails.has(emailId)) {
      expandedEmails.delete(emailId);
    } else {
      expandedEmails.add(emailId);
    }
  }

  interface SocialMeta {
    icon: string;
    color: string;
    bg: string;
    label: string;
  }

  function getSocialMeta(platform: string): SocialMeta {
    const p = platform.toLowerCase();
    const base = { color: 'text-fc-fg', bg: 'bg-fc-surface' };
    if (p.includes('linkedin')) return { ...base, icon: 'mdi:linkedin', label: 'LinkedIn' };
    if (p.includes('instagram')) return { ...base, icon: 'mdi:instagram', label: 'Instagram' };
    if (p.includes('facebook')) return { ...base, icon: 'mdi:facebook', label: 'Facebook' };
    if (p.includes('twitter') || p.includes('x.com') || p === 'x') return { ...base, icon: 'ri:twitter-x-fill', label: 'X / Twitter' };
    if (p.includes('tiktok')) return { ...base, icon: 'ic:baseline-tiktok', label: 'TikTok' };
    if (p.includes('youtube')) return { ...base, icon: 'mdi:youtube', label: 'YouTube' };
    if (p.includes('github')) return { ...base, icon: 'mdi:github', label: 'GitHub' };
    if (p.includes('pinterest')) return { ...base, icon: 'mdi:pinterest', label: 'Pinterest' };
    if (p.includes('snapchat')) return { ...base, icon: 'mdi:snapchat', label: 'Snapchat' };
    if (p.includes('medium')) return { ...base, icon: 'mdi:medium', label: 'Medium' };
    if (p.includes('whatsapp')) return { ...base, icon: 'mdi:whatsapp', label: 'WhatsApp' };
    if (p.includes('telegram')) return { ...base, icon: 'mdi:telegram', label: 'Telegram' };
    if (p.includes('discord')) return { ...base, icon: 'ic:baseline-discord', label: 'Discord' };
    if (p.includes('reddit')) return { ...base, icon: 'mdi:reddit', label: 'Reddit' };
    if (p.includes('threads')) return { ...base, icon: 'ri:threads-fill', label: 'Threads' };
    if (p.includes('mastodon')) return { ...base, icon: 'mdi:mastodon', label: 'Mastodon' };
    if (p.includes('bluesky') || p.includes('bsky')) return { ...base, icon: 'simple-icons:bluesky', label: 'Bluesky' };
    if (p.includes('vimeo')) return { ...base, icon: 'mdi:vimeo', label: 'Vimeo' };
    if (p.includes('behance')) return { ...base, icon: 'mdi:behance', label: 'Behance' };
    if (p.includes('dribbble')) return { ...base, icon: 'mdi:dribbble', label: 'Dribbble' };
    if (p.includes('spotify')) return { ...base, icon: 'mdi:spotify', label: 'Spotify' };
    if (p.includes('soundcloud')) return { ...base, icon: 'mdi:soundcloud', label: 'SoundCloud' };
    if (p.includes('slack')) return { ...base, icon: 'mdi:slack', label: 'Slack' };
    if (p.includes('yelp')) return { ...base, icon: 'mdi:yelp', label: 'Yelp' };
    if (p.includes('tripadvisor')) return { ...base, icon: 'mdi:tripadvisor', label: 'TripAdvisor' };
    if (p.includes('twitch')) return { ...base, icon: 'mdi:twitch', label: 'Twitch' };
    return { ...base, icon: 'mdi:link-variant', label: platform };
  }

  function getGoogleMapsCoordsUrl(lat: number, lng: number): string {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  function getDisplayName(lead: Lead): string {
    const parts = [lead.firstName, lead.lastName].filter(Boolean);
    if (parts.length > 0) return parts.join(' ');
    if (lead.businessName) return lead.businessName;
    if (lead.companyInfo?.name) return lead.companyInfo.name;
    return lead.domain ?? '';
  }

  async function toggleFavorite() {
    if (togglingFavorite) return;

    togglingFavorite = true;
    try {
      const result = await trpc.lead.favorite.toggle.mutate({ leadId });
      isFavorite = result.isFavorite;
      toast.success(
        isFavorite ? t('leads.detail.favAdded') : t('leads.detail.favRemoved'));
    } catch (error) {
      toast.danger(t('leads.detail.favFailed'));
      console.error(error);
    } finally {
      togglingFavorite = false;
    }
  }

  let technologies = $derived(lead?.technologies ?? []);
  let additionalEmails = $derived(lead?.additionalEmails ?? []);
  let phoneNumbers = $derived(lead?.phoneNumbers ?? []);
  let socialProfiles = $derived(lead?.socialProfiles ?? []);
</script>

{#snippet contactRow(icon: string, label: string, value: string)}
  <div class="flex min-w-0 flex-1 items-center gap-3">
    <div class="inline-flex size-8 shrink-0 items-center justify-center rounded-fc-md bg-fc-surface text-fc-fg">
      <iconify-icon {icon} width="14" height="14" class="block"></iconify-icon>
    </div>
    <div class="min-w-0 flex-1">
      <p class="text-fc-xs text-fc-fg-muted">{label}</p>
      <p class="truncate text-fc-sm text-fc-fg">{value}</p>
    </div>
  </div>
{/snippet}

{#if loading}
  <div class="flex items-center justify-center py-24" in:fade>
    <Spinner size="lg" />
  </div>
{:else if !lead}
  <div in:fade>
    <EmptyState icon="solar:close-circle-linear" title={t('leads.detail.notFound')}>
      <Button href="/app/leads">{t('leads.detail.back')}</Button>
    </EmptyState>
  </div>
{:else}
  <div class="flex flex-col gap-10" in:fade>
    <PageHeader
      title={getDisplayName(lead)}
      description={(lead.firstName || lead.lastName) && lead.domain
        ? `${lead.domain}${lead.position ? ` · ${lead.position}` : ''}`
        : (lead.position ?? undefined)}
      back={{ href: '/app/leads', label: t('leads.title') }}
    >
      {#snippet actions()}
        <Badge tone={getPriorityTone(lead!.status)}>{lead!.status}</Badge>

        {#if lead!.outcome === 'WON'}
          <Badge tone="success" class="shrink-0">
            {lead!.wonAgainstCompetitorId ? t('close.wonAgainstBadge', { name: competitorName(lead!.wonAgainstCompetitorId) }) : t('close.wonBadge')}
          </Badge>
        {:else if lead!.outcome === 'LOST'}
          <Badge tone="danger" class="shrink-0">
            {lead!.lostToCompetitorId ? t('close.lostToBadge', { name: competitorName(lead!.lostToCompetitorId) }) : t('close.lostBadge')}
          </Badge>
        {/if}

        {#if lead!.contacted}
          <Badge>
            <iconify-icon icon="solar:check-circle-linear" width="12" height="12" class="block"></iconify-icon>
            {t('leads.contacted')}
          </Badge>
        {:else}
          <Badge>
            <iconify-icon icon="solar:clock-circle-linear" width="12" height="12" class="block"></iconify-icon>
            {t('leads.detail.notContacted')}
          </Badge>
        {/if}

        <Button
          variant="secondary"
          onclick={toggleFavorite}
          disabled={togglingFavorite}
          icon={togglingFavorite ? undefined : isFavorite ? 'solar:heart-broken-linear' : 'solar:heart-linear'}
        >
          {#if togglingFavorite}
            <Spinner size="sm" />
          {/if}
          {isFavorite ? t('leads.detail.removeFav') : t('leads.detail.addFav')}
        </Button>

        {#if lead!.outcome}
          <Button variant="secondary" icon="solar:restart-linear" onclick={reopen}>{t('close.reopen')}</Button>
        {:else}
          <Button variant="secondary" icon="solar:flag-linear" onclick={() => (closeOpen = true)}>{t('close.action')}</Button>
        {/if}

        {#if lead!.email}
          <Button onclick={() => (composerOpen = true)} icon="solar:letter-linear">Envoyer un e-mail</Button>
        {/if}
      {/snippet}
    </PageHeader>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div class="flex flex-col gap-4 lg:col-span-2">
        <Card class="flex flex-col gap-4">
          <div class="flex items-start gap-4">
            <div class="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-fc-md bg-fc-surface text-fc-lg font-semibold text-fc-fg-muted">
              {#if lead.domain}
                <img
                  src={getFaviconUrl(lead.domain, 64)}
                  alt="{lead.domain} favicon"
                  class="h-6 w-6"
                  loading="lazy"
                  onerror={(e) => handleFaviconError(e.currentTarget)}
                />
              {:else}
                {(lead.firstName?.[0] || lead.businessName?.[0] || lead.companyInfo?.name?.[0] || '?').toUpperCase()}
              {/if}
            </div>
            <div class="min-w-0 flex-1">
              <h2 class="truncate text-fc-lg font-semibold text-fc-fg">{getDisplayName(lead)}</h2>
              {#if lead.position}
                <p class="mt-0.5 text-fc-sm text-fc-fg-muted">{lead.position}</p>
              {/if}
              {#if lead.department}
                <p class="mt-0.5 text-fc-xs text-fc-fg-muted">{lead.department}</p>
              {/if}
              <div class="mt-3 flex items-center gap-2">
                <div
                  class="h-1.5 flex-1 overflow-hidden rounded-fc-pill bg-fc-surface"
                  role="progressbar"
                  aria-label={t('leads.sort.score')}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(lead.score, 100)}
                >
                  <div class="h-full bg-fc-accent transition-all" style="width: {Math.min(lead.score, 100)}%"></div>
                </div>
                <span class="text-fc-xs font-medium text-fc-fg">{lead.score}/100</span>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 pt-4">
            <div>
              <p class="text-fc-xs text-fc-fg-muted">{t('leads.detail.emailsSent')}</p>
              <p class="mt-0.5 text-fc-xl font-semibold text-fc-fg">{lead.emailsSentCount}</p>
            </div>
            <div>
              <p class="text-fc-xs text-fc-fg-muted">{t('leads.detail.lastContact')}</p>
              <p class="mt-0.5 text-fc-sm text-fc-fg">{lead.lastContactedAt ? formatDate(lead.lastContactedAt) : '—'}</p>
            </div>
          </div>
        </Card>

        <Card class="flex flex-col gap-3">
          <h3 class="flex items-center gap-2 text-fc-md font-semibold text-fc-fg">
            <iconify-icon icon="solar:user-id-linear" width="18" height="18" class="block"></iconify-icon>
            {t('leads.detail.contactInfo')}
          </h3>

          {#if lead.email}
            <a href="mailto:{lead.email}" class={rowLinkClass}>
              {@render contactRow('solar:letter-linear', t('leads.detail.primaryEmail'), lead.email)}
              {#if lead.emailVerified === true}
                <Badge tone="success" class="shrink-0" title={t('leads.detail.verifiedOn', { date: lead.emailVerifiedAt ? formatDate(lead.emailVerifiedAt) : '' })}>
                  <iconify-icon icon="solar:check-circle-linear" width="12" height="12" class="block"></iconify-icon>
                  {t('leads.detail.verified')}
                </Badge>
              {:else if lead.emailVerified === false}
                <Badge tone="danger" class="shrink-0" title={t('leads.detail.invalidTitle', { method: lead.emailVerificationMethod ?? '' })}>
                  <iconify-icon icon="solar:close-circle-linear" width="12" height="12" class="block"></iconify-icon>
                  {t('leads.detail.invalid')}
                </Badge>
              {:else}
                <Badge class="shrink-0">
                  <iconify-icon icon="solar:question-circle-linear" width="12" height="12" class="block"></iconify-icon>
                  {t('leads.detail.unverified')}
                </Badge>
              {/if}
              <iconify-icon icon="solar:arrow-right-up-linear" width="14" height="14" class="block shrink-0 text-fc-fg-muted"></iconify-icon>
            </a>
          {/if}

          {#each additionalEmails as email, i (i)}
            <a href="mailto:{email}" class={rowLinkClass}>
              {@render contactRow('solar:letter-linear', t('leads.detail.emailN', { n: i + 2 }), email)}
              <iconify-icon icon="solar:arrow-right-up-linear" width="14" height="14" class="block shrink-0 text-fc-fg-muted"></iconify-icon>
            </a>
          {/each}

          {#each phoneNumbers as phone, i (i)}
            <a href="tel:{phone}" class={rowLinkClass}>
              {@render contactRow('solar:phone-linear', t('leads.filter.phone'), phone)}
              <iconify-icon icon="solar:arrow-right-up-linear" width="14" height="14" class="block shrink-0 text-fc-fg-muted"></iconify-icon>
            </a>
          {/each}

          {#if lead.domain}
            <a href="https://{lead.domain}" target="_blank" rel="noopener noreferrer" class={rowLinkClass}>
              {@render contactRow('solar:global-linear', t('leads.filter.website'), lead.domain)}
              <iconify-icon icon="solar:arrow-right-up-linear" width="14" height="14" class="block shrink-0 text-fc-fg-muted"></iconify-icon>
            </a>
          {/if}

          {#if lead.city || lead.country}
            <div class="flex items-center gap-3 rounded-fc-md px-3 py-2.5">
              {@render contactRow('solar:map-point-linear', t('leads.sort.location'), [lead.city, lead.country].filter(Boolean).join(', '))}
            </div>
          {/if}

          {#if !lead.email && additionalEmails.length === 0 && phoneNumbers.length === 0}
            <Alert tone="danger" class="flex items-center gap-2 text-fc-xs">
              <iconify-icon icon="solar:danger-triangle-linear" width="14" height="14" class="block shrink-0"></iconify-icon>
              {t('leads.detail.noContact')}
            </Alert>
          {/if}
        </Card>

        {#if lead.coordinates}
          <Card class="flex flex-col gap-3 overflow-hidden p-0">
            <div class="flex items-center justify-between gap-3 px-5 pt-5">
              <h3 class="flex items-center gap-2 text-fc-md font-semibold text-fc-fg">
                <iconify-icon icon="solar:map-point-linear" width="18" height="18" class="block"></iconify-icon>
                {t('leads.sort.location')}
              </h3>
              <Button
                variant="secondary"
                size="sm"
                icon="solar:map-arrow-right-linear"
                href={getGoogleMapsCoordsUrl(lead.coordinates.lat, lead.coordinates.lng)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Maps
              </Button>
            </div>
            <div class="h-56 px-3 pb-3">
              <LeadLocationMap
                lat={lead.coordinates.lat}
                lng={lead.coordinates.lng}
                name={lead.businessName || lead.companyInfo?.name || lead.domain || getDisplayName(lead)}
              />
            </div>
          </Card>
        {/if}

        {#if socialProfiles.length > 0}
          <Card class="flex flex-col gap-3">
            <h3 class="flex items-center gap-2 text-fc-md font-semibold text-fc-fg">
              <iconify-icon icon="solar:share-linear" width="18" height="18" class="block"></iconify-icon>
              {t('leads.stats.socials')}
              <Badge class="ml-auto">{socialProfiles.length}</Badge>
            </h3>
            <div class="flex flex-col gap-2">
              {#each socialProfiles as profile, i (i)}
                {@const meta = getSocialMeta(profile.platform)}
                <a href={profile.url} target="_blank" rel="external noopener noreferrer" class="group {rowLinkClass}">
                  <div class="inline-flex size-8 shrink-0 items-center justify-center rounded-fc-md {meta.bg} {meta.color}">
                    <iconify-icon icon={meta.icon} width="16" height="16" class="block"></iconify-icon>
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-fc-sm font-medium text-fc-fg">{meta.label}</p>
                    <p class="truncate text-fc-xs text-fc-fg-muted">{profile.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</p>
                  </div>
                  <iconify-icon icon="solar:arrow-right-up-linear" width="14" height="14" class="block shrink-0 text-fc-fg-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"></iconify-icon>
                </a>
              {/each}
            </div>
          </Card>
        {/if}

        {#if lead.companyInfo}
          <Card class="flex flex-col gap-4">
            <h3 class="flex items-center gap-2 text-fc-md font-semibold text-fc-fg">
              <iconify-icon icon="solar:buildings-2-linear" width="18" height="18" class="block"></iconify-icon>
              {t('leads.detail.company')}
            </h3>
            <div class="flex flex-col gap-3">
              {#if lead.companyInfo.name}
                <div>
                  <p class="text-fc-xs text-fc-fg-muted">{t('leads.detail.name')}</p>
                  <p class="mt-0.5 text-fc-sm font-medium text-fc-fg">{lead.companyInfo.name}</p>
                </div>
              {/if}
              <div class="grid grid-cols-2 gap-3">
                {#if lead.companyInfo.industry}
                  <div>
                    <p class="text-fc-xs text-fc-fg-muted">{t('leads.detail.industry')}</p>
                    <p class="mt-0.5 text-fc-sm text-fc-fg">{lead.companyInfo.industry}</p>
                  </div>
                {/if}
                {#if lead.companyInfo.size}
                  <div>
                    <p class="text-fc-xs text-fc-fg-muted">{t('leads.detail.size')}</p>
                    <p class="mt-0.5 text-fc-sm text-fc-fg">{lead.companyInfo.size}</p>
                  </div>
                {/if}
                {#if lead.companyInfo.founded}
                  <div>
                    <p class="text-fc-xs text-fc-fg-muted">{t('leads.detail.founded')}</p>
                    <p class="mt-0.5 text-fc-sm text-fc-fg">{lead.companyInfo.founded}</p>
                  </div>
                {/if}
              </div>
              {#if lead.companyInfo.website}
                <div>
                  <p class="text-fc-xs text-fc-fg-muted">{t('leads.filter.website')}</p>
                  <a
                    href={lead.companyInfo.website}
                    target="_blank"
                    rel="external noopener noreferrer"
                    class="mt-0.5 block rounded-fc-xs text-fc-sm break-all text-fc-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring"
                  >
                    {lead.companyInfo.website}
                  </a>
                </div>
              {/if}
              {#if lead.companyInfo.description}
                <div class="pt-3">
                  <p class="mb-1 text-fc-xs text-fc-fg-muted">{t('leads.detail.about')}</p>
                  <p class="text-fc-sm leading-relaxed text-fc-fg">{lead.companyInfo.description}</p>
                </div>
              {/if}
            </div>
          </Card>
        {/if}

        {#if technologies.length > 0}
          <Card class="flex flex-col gap-3">
            <h3 class="flex items-center gap-2 text-fc-md font-semibold text-fc-fg">
              <iconify-icon icon="solar:code-linear" width="18" height="18" class="block"></iconify-icon>
              {t('leads.detail.techStack')}
            </h3>
            <div class="flex flex-wrap gap-1.5">
              {#each technologies as tech, i (i)}
                <Badge>{tech}</Badge>
              {/each}
            </div>
          </Card>
        {/if}

        {#if lead.scrapedAt || lead.auditedAt}
          <Card class="flex flex-col gap-2">
            {#if lead.scrapedAt}
              <div class="flex items-center gap-2 text-fc-xs text-fc-fg-muted">
                <iconify-icon icon="solar:refresh-linear" width="14" height="14" class="block"></iconify-icon>
                <span>{t('leads.detail.scraped')}</span>
                <span class="font-medium text-fc-fg">{formatDate(lead.scrapedAt)}</span>
              </div>
            {/if}
            {#if lead.auditedAt}
              <div class="flex items-center gap-2 text-fc-xs text-fc-fg-muted">
                <iconify-icon icon="solar:shield-check-linear" width="14" height="14" class="block"></iconify-icon>
                <span>{t('leads.detail.audited')}</span>
                <span class="font-medium text-fc-fg">{formatDate(lead.auditedAt)}</span>
              </div>
            {/if}
          </Card>
        {/if}
      </div>

      <div class="flex flex-col gap-4 lg:col-span-3">
        {#if !lead.email}
          <EmptyState
            icon="solar:letter-linear"
            title={t('leads.detail.noEmail')}
            description={t('leads.detail.noEmailText')}
          />
        {/if}

        <Card class="overflow-hidden p-0">
          <div class="flex items-center justify-between gap-3 px-5 py-4">
            <h2 class="flex items-center gap-2 text-fc-lg font-semibold text-fc-fg">
              <iconify-icon icon="solar:history-linear" width="18" height="18" class="block"></iconify-icon>
              {t('leads.detail.history')}
            </h2>
            <Badge>{t('leads.detail.emailCount', { count: outreachHistory.length })}</Badge>
          </div>

          <div class="p-5">
            {#if outreachHistory.length === 0}
              <EmptyState bare icon="solar:inbox-line-linear" title={t('leads.detail.noneSent')} class="py-10" />
            {:else}
              <div class="flex flex-col gap-2">
                {#each outreachHistory as email (email.id)}
                  <div class="overflow-hidden rounded-fc-md " in:fade>
                    <button
                      type="button"
                      onclick={() => toggleEmailExpansion(email.id)}
                      aria-expanded={expandedEmails.has(email.id)}
                      class="w-full px-4 py-3 text-left transition-colors hover:bg-fc-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fc-ring"
                    >
                      <div class="flex items-center justify-between gap-3">
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-fc-sm font-medium text-fc-fg">{email.subject}</p>
                          <p class="mt-0.5 flex items-center gap-1.5 text-fc-xs text-fc-fg-muted">
                            <iconify-icon icon="solar:calendar-linear" width="12" height="12" class="block"></iconify-icon>
                            {formatDate(email.sentAt || email.createdAt)}
                          </p>
                        </div>
                        <div class="flex shrink-0 items-center gap-2">
                          <Badge tone={getStatusTone(email.status)}>{email.status}</Badge>
                          <iconify-icon
                            icon={expandedEmails.has(email.id) ? 'mdi:chevron-up' : 'mdi:chevron-down'}
                            width="16"
                            height="16"
                            class="block text-fc-fg-muted"
                          ></iconify-icon>
                        </div>
                      </div>
                    </button>

                    {#if expandedEmails.has(email.id)}
                      <div class="flex flex-col gap-3 bg-fc-surface px-4 py-3" in:fly={{ y: -8, duration: 150 }}>
                        {#if email.error}
                          <Alert tone="danger" class="flex items-start gap-2 text-fc-xs">
                            <iconify-icon icon="solar:danger-triangle-linear" width="14" height="14" class="mt-0.5 block shrink-0"></iconify-icon>
                            <p>{email.error}</p>
                          </Alert>
                        {/if}

                        <div>
                          <p class="mb-1.5 text-fc-xs text-fc-fg-muted">{t('leads.detail.content')}</p>
                          <div class="rounded-fc-md bg-fc-bg p-3">
                            <p class="text-fc-sm leading-relaxed whitespace-pre-wrap text-fc-fg">{email.textBody || t('leads.detail.noContent')}</p>
                          </div>
                        </div>

                        {#if email.variables && Object.keys(email.variables).length > 0}
                          <div>
                            <p class="mb-1.5 text-fc-xs text-fc-fg-muted">{t('leads.detail.variables')}</p>
                            <div class="grid grid-cols-2 gap-2">
                              {#each Object.entries(email.variables) as [key, value] (key)}
                                <div class="rounded-fc-md bg-fc-bg px-3 py-2">
                                  <p class="text-fc-xs text-fc-fg-muted">{key}</p>
                                  <p class="mt-0.5 text-fc-sm text-fc-fg">{value}</p>
                                </div>
                              {/each}
                            </div>
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </Card>
      </div>
    </div>
  </div>
{/if}

{#if lead}
  <CloseLeadModal
    bind:open={closeOpen}
    {leadId}
    {teamId}
    competitors={competitors.filter((c) => c.active)}
    onClosed={loadData}
  />
  <Composer
    bind:open={composerOpen}
    person={{ ...lead, companyName: lead.businessName || lead.companyInfo?.name || lead.domain }}
    onSend={sendToLead}
    onDone={loadData}
  />
{/if}
