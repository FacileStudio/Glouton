<script lang="ts">
  import { getErrorMessage } from '$lib/utils/trpc-error';
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import type { PageProps } from './$types';
  import { fade, fly } from 'svelte/transition';
  import DOMPurify from 'isomorphic-dompurify';
  import { trpc } from '$lib/trpc';
  import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner, toast } from '@facile/muse';
  import { getFaviconUrl, handleFaviconError } from '$lib/utils/favicon';
  import LeadLocationMap from '$lib/components/leads/LeadLocationMap.svelte';
  import { teamContextStore } from '$lib/stores/team-context.svelte';

  let teamId = $derived(teamContextStore.getTeamId());
  let settingsUrl = $derived(teamId ? `/app/teams/${teamId}/settings` : '/app/settings');

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
  }

  interface EmailTemplate {
    id: string;
    name: string;
    subject: string;
    variables: string[];
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
  let templates = $state<EmailTemplate[]>([]);
  let outreachHistory = $state<EmailOutreach[]>([]);
  let loading = $state(true);
  let sending = $state(false);
  let selectedTemplate = $state('');
  let variables: Record<string, string> = $state({});
  let emailPreview = $state({ subject: '', html: '', text: '' });
  let previewLoading = $state(false);
  const expandedEmails = new SvelteSet<string>();
  let isInitialLoad = $state(true);
  let isFavorite = $state(false);
  let togglingFavorite = $state(false);
  let smtpConfigured = $state<boolean>(true);
  let checkingSmtp = $state(true);

  let { params }: PageProps = $props();
  let leadId = $derived(params.id);

  onMount(async () => {
    await Promise.all([loadData(), checkSmtpConfiguration()]);
  });

  async function loadData() {
    loading = true;
    try {
      const currentTeamId = teamId;
      const [leadData, templatesData, historyData, favoriteStatus] = await Promise.all([
        trpc.lead.query.getById.query({ leadId }),
        trpc.email.getTemplates.query(),
        trpc.email.getLeadOutreach.query({ leadId, teamId: currentTeamId }),
        trpc.lead.favorite.isFavorite.query({ leadId, teamId: currentTeamId }),
      ]);

      lead = leadData;
      templates = [...templatesData];
      outreachHistory = [...historyData];
      isFavorite = favoriteStatus.isFavorite;

      if (templatesData.length > 0 && !selectedTemplate) {
        selectedTemplate = templatesData[0].id;
        variables = {};
        templatesData[0].variables.forEach((variable: string) => {
          if (variable === 'recipientName' && leadData) {
            variables[variable] = leadData.firstName || leadData.businessName || leadData.domain || '';
          } else if (variable === 'companyName' && leadData) {
            variables[variable] = leadData.businessName || leadData.companyInfo?.name || leadData.domain || '';
          } else {
            variables[variable] = '';
          }
        });
      }
    } catch (error) {
      toast.danger('Échec du chargement du lead');
      console.error(error);
    } finally {
      isInitialLoad = false;
      loading = false;
    }
  }

  async function checkSmtpConfiguration() {
    checkingSmtp = true;
    try {
      const status = await trpc.email.getSmtpStatus.query({ teamId });
      smtpConfigured = status.configured;
    } catch (error) {
      console.error('[LEAD] Error checking SMTP config:', error);
      smtpConfigured = false;
    } finally {
      checkingSmtp = false;
    }
  }

  function updateVariables(template: EmailTemplate) {
    const newVars: Record<string, string> = {};
    template.variables.forEach((variable) => {
      if (variable === 'recipientName' && lead) {
        newVars[variable] = lead.firstName || lead.businessName || lead.domain || '';
      } else if (variable === 'companyName' && lead) {
        newVars[variable] = lead.businessName || lead.companyInfo?.name || lead.domain || '';
      } else {
        newVars[variable] = '';
      }
    });
    variables = newVars;
    if (!isInitialLoad) {
      updatePreview();
    }
  }

  async function updatePreview() {
    if (!selectedTemplate) {
      emailPreview = { subject: '', html: '', text: '' };
      return;
    }

    previewLoading = true;
    try {
      const vars = { ...variables };
      Object.keys(vars).forEach((key) => {
        if (!vars[key]) vars[key] = `{{${key}}}`;
      });

      const preview = await trpc.email.previewEmail.query({
        templateId: selectedTemplate,
        variables: vars,
      });

      emailPreview = preview;
    } catch (error) {
      console.error('Failed to update preview:', error);
    } finally {
      previewLoading = false;
    }
  }

  function handleTemplateChange() {
    const template = templates.find((t) => t.id === selectedTemplate);
    if (template) updateVariables(template);
  }

  async function sendEmail() {
    if (!lead || !lead.email) {
      toast.danger("Ce lead n'a pas d'adresse e-mail");
      return;
    }

    const template = templates.find((t) => t.id === selectedTemplate);
    if (!template) {
      toast.danger('Veuillez sélectionner un modèle');
      return;
    }

    for (const variable of template.variables) {
      if (!variables[variable]) {
        toast.danger(`Veuillez remplir : ${variable}`);
        return;
      }
    }

    sending = true;
    try {
      await trpc.email.sendEmail.mutate({
        teamId,
        leadId: lead.id,
        templateId: selectedTemplate,
        variables,
      });

      toast.success('E-mail envoyé avec succès !');
      await loadData();
    } catch (error) {
      toast.danger(getErrorMessage(error, "Échec de l'envoi de l'e-mail"));
      console.error(error);
    } finally {
      sending = false;
    }
  }

  function formatDate(date: string | Date | null): string {
    if (!date) return 'Jamais';
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getStatusTone(status: string): 'danger' | 'neutral' {
    return status === 'FAILED' ? 'danger' : 'neutral';
  }

  function getPriorityTone(status: Lead['status']): 'danger' | 'neutral' {
    return status === 'HOT' ? 'danger' : 'neutral';
  }

  const rowLinkClass =
    'flex items-center gap-3 rounded-fc-md border border-fc-border px-3 py-2.5 transition-colors hover:bg-fc-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring';

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
        isFavorite ? 'Lead ajouté aux favoris' : 'Lead retiré des favoris');
    } catch (error) {
      toast.danger('Échec de la mise à jour des favoris');
      console.error(error);
    } finally {
      togglingFavorite = false;
    }
  }

  let technologies = $derived(lead?.technologies ?? []);
  let additionalEmails = $derived(lead?.additionalEmails ?? []);
  let phoneNumbers = $derived(lead?.phoneNumbers ?? []);
  let socialProfiles = $derived(lead?.socialProfiles ?? []);
  const previewStyles =
    "body{margin:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;font-size:14px}p{margin:0 0 .875em}h1,h2,h3{margin:1.25em 0 .5em}.container{max-width:100%;margin:0 auto}.header{padding:20px;border-radius:8px 8px 0 0}.content{padding:20px;border-radius:0 0 8px 8px}.footer{text-align:center;margin-top:20px;font-size:11px}";
  let previewDocument = $derived(`<style>${previewStyles}</style>${DOMPurify.sanitize(emailPreview.html)}`);

  $effect(() => {
    const _ = [selectedTemplate, variables];
    if (!isInitialLoad && selectedTemplate) {
      updatePreview();
    }
  });
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
    <EmptyState icon="solar:close-circle-linear" title="Lead introuvable">
      <Button href="/app/leads">Retour aux leads</Button>
    </EmptyState>
  </div>
{:else}
  <div class="flex flex-col gap-10" in:fade>
    <PageHeader
      title={getDisplayName(lead)}
      description={(lead.firstName || lead.lastName) && lead.domain
        ? `${lead.domain}${lead.position ? ` · ${lead.position}` : ''}`
        : (lead.position ?? undefined)}
      back={{ href: '/app/leads', label: 'Leads' }}
    >
      {#snippet actions()}
        <Badge tone={getPriorityTone(lead!.status)}>{lead!.status}</Badge>

        {#if lead!.contacted}
          <Badge>
            <iconify-icon icon="solar:check-circle-linear" width="12" height="12" class="block"></iconify-icon>
            Contacté
          </Badge>
        {:else}
          <Badge>
            <iconify-icon icon="solar:clock-circle-linear" width="12" height="12" class="block"></iconify-icon>
            Non contacté
          </Badge>
        {/if}

        <Button
          variant="outline"
          onclick={toggleFavorite}
          disabled={togglingFavorite}
          icon={togglingFavorite ? undefined : isFavorite ? 'solar:heart-broken-linear' : 'solar:heart-linear'}
        >
          {#if togglingFavorite}
            <Spinner size="sm" />
          {/if}
          {isFavorite ? 'Retirer favori' : 'Ajouter favori'}
        </Button>

        {#if lead!.email}
          <Button href="#email-section" icon="solar:letter-linear">Envoyer un e-mail</Button>
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
                  aria-label="Score"
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

          <div class="grid grid-cols-2 gap-3 border-t border-fc-border pt-4">
            <div>
              <p class="text-fc-xs text-fc-fg-muted">E-mails envoyés</p>
              <p class="mt-0.5 text-fc-xl font-semibold text-fc-fg">{lead.emailsSentCount}</p>
            </div>
            <div>
              <p class="text-fc-xs text-fc-fg-muted">Dernier contact</p>
              <p class="mt-0.5 text-fc-sm text-fc-fg">{lead.lastContactedAt ? formatDate(lead.lastContactedAt) : '—'}</p>
            </div>
          </div>
        </Card>

        <Card class="flex flex-col gap-3">
          <h3 class="flex items-center gap-2 text-fc-md font-semibold text-fc-fg">
            <iconify-icon icon="solar:user-id-linear" width="18" height="18" class="block"></iconify-icon>
            Coordonnées
          </h3>

          {#if lead.email}
            <a href="mailto:{lead.email}" class={rowLinkClass}>
              {@render contactRow('solar:letter-linear', 'E-mail principal', lead.email)}
              {#if lead.emailVerified === true}
                <Badge tone="success" class="shrink-0" title="Email vérifié le {lead.emailVerifiedAt ? formatDate(lead.emailVerifiedAt) : ''}">
                  <iconify-icon icon="solar:check-circle-linear" width="12" height="12" class="block"></iconify-icon>
                  Vérifié
                </Badge>
              {:else if lead.emailVerified === false}
                <Badge tone="danger" class="shrink-0" title="Email invalide ({lead.emailVerificationMethod ?? ''})">
                  <iconify-icon icon="solar:close-circle-linear" width="12" height="12" class="block"></iconify-icon>
                  Invalide
                </Badge>
              {:else}
                <Badge class="shrink-0">
                  <iconify-icon icon="solar:question-circle-linear" width="12" height="12" class="block"></iconify-icon>
                  Non vérifié
                </Badge>
              {/if}
              <iconify-icon icon="solar:arrow-right-up-linear" width="14" height="14" class="block shrink-0 text-fc-fg-muted"></iconify-icon>
            </a>
          {/if}

          {#each additionalEmails as email, i (i)}
            <a href="mailto:{email}" class={rowLinkClass}>
              {@render contactRow('solar:letter-linear', `E-mail ${i + 2}`, email)}
              <iconify-icon icon="solar:arrow-right-up-linear" width="14" height="14" class="block shrink-0 text-fc-fg-muted"></iconify-icon>
            </a>
          {/each}

          {#each phoneNumbers as phone, i (i)}
            <a href="tel:{phone}" class={rowLinkClass}>
              {@render contactRow('solar:phone-linear', 'Téléphone', phone)}
              <iconify-icon icon="solar:arrow-right-up-linear" width="14" height="14" class="block shrink-0 text-fc-fg-muted"></iconify-icon>
            </a>
          {/each}

          {#if lead.domain}
            <a href="https://{lead.domain}" target="_blank" rel="noopener noreferrer" class={rowLinkClass}>
              {@render contactRow('solar:global-linear', 'Site web', lead.domain)}
              <iconify-icon icon="solar:arrow-right-up-linear" width="14" height="14" class="block shrink-0 text-fc-fg-muted"></iconify-icon>
            </a>
          {/if}

          {#if lead.city || lead.country}
            <div class="flex items-center gap-3 rounded-fc-md border border-fc-border px-3 py-2.5">
              {@render contactRow('solar:map-point-linear', 'Localisation', [lead.city, lead.country].filter(Boolean).join(', '))}
            </div>
          {/if}

          {#if !lead.email && additionalEmails.length === 0 && phoneNumbers.length === 0}
            <Alert tone="danger" class="flex items-center gap-2 text-fc-xs">
              <iconify-icon icon="solar:danger-triangle-linear" width="14" height="14" class="block shrink-0"></iconify-icon>
              Aucune information de contact disponible
            </Alert>
          {/if}
        </Card>

        {#if lead.coordinates}
          <Card class="flex flex-col gap-3 overflow-hidden p-0">
            <div class="flex items-center justify-between gap-3 px-5 pt-5">
              <h3 class="flex items-center gap-2 text-fc-md font-semibold text-fc-fg">
                <iconify-icon icon="solar:map-point-linear" width="18" height="18" class="block"></iconify-icon>
                Localisation
              </h3>
              <Button
                variant="outline"
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
              Profils sociaux
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
              Entreprise
            </h3>
            <div class="flex flex-col gap-3">
              {#if lead.companyInfo.name}
                <div>
                  <p class="text-fc-xs text-fc-fg-muted">Nom</p>
                  <p class="mt-0.5 text-fc-sm font-medium text-fc-fg">{lead.companyInfo.name}</p>
                </div>
              {/if}
              <div class="grid grid-cols-2 gap-3">
                {#if lead.companyInfo.industry}
                  <div>
                    <p class="text-fc-xs text-fc-fg-muted">Secteur</p>
                    <p class="mt-0.5 text-fc-sm text-fc-fg">{lead.companyInfo.industry}</p>
                  </div>
                {/if}
                {#if lead.companyInfo.size}
                  <div>
                    <p class="text-fc-xs text-fc-fg-muted">Taille</p>
                    <p class="mt-0.5 text-fc-sm text-fc-fg">{lead.companyInfo.size}</p>
                  </div>
                {/if}
                {#if lead.companyInfo.founded}
                  <div>
                    <p class="text-fc-xs text-fc-fg-muted">Fondée en</p>
                    <p class="mt-0.5 text-fc-sm text-fc-fg">{lead.companyInfo.founded}</p>
                  </div>
                {/if}
              </div>
              {#if lead.companyInfo.website}
                <div>
                  <p class="text-fc-xs text-fc-fg-muted">Site web</p>
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
                <div class="border-t border-fc-border pt-3">
                  <p class="mb-1 text-fc-xs text-fc-fg-muted">À propos</p>
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
              Stack technique
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
                <span>Collecté :</span>
                <span class="font-medium text-fc-fg">{formatDate(lead.scrapedAt)}</span>
              </div>
            {/if}
            {#if lead.auditedAt}
              <div class="flex items-center gap-2 text-fc-xs text-fc-fg-muted">
                <iconify-icon icon="solar:shield-check-linear" width="14" height="14" class="block"></iconify-icon>
                <span>Audité :</span>
                <span class="font-medium text-fc-fg">{formatDate(lead.auditedAt)}</span>
              </div>
            {/if}
          </Card>
        {/if}
      </div>

      <div class="flex scroll-mt-24 flex-col gap-4 lg:col-span-3" id="email-section">
        {#if lead.email}
          <Card class="overflow-hidden p-0">
            <div class="flex flex-col gap-1 border-b border-fc-border p-5">
              <h2 class="flex items-center gap-2 text-fc-lg font-semibold text-fc-fg">
                <iconify-icon icon="solar:letter-linear" width="20" height="20" class="block"></iconify-icon>
                Prospection par e-mail
              </h2>
              <p class="text-fc-sm text-fc-fg-muted">
                Envoi à <span class="font-medium text-fc-fg">{lead.email}</span>
              </p>
            </div>

            {#if !checkingSmtp && !smtpConfigured}
              <Alert tone="warning" title="Configuration SMTP manquante" class="mx-5 mt-4 flex flex-col items-start gap-2">
                <p class="text-fc-xs leading-relaxed">
                  Vous devez configurer vos paramètres SMTP pour pouvoir envoyer des e-mails.
                </p>
                <Button href={settingsUrl} size="sm" icon="solar:settings-linear">Configurer SMTP</Button>
              </Alert>
            {/if}

            <div class="grid grid-cols-1 xl:grid-cols-2">
              <div class="flex flex-col gap-4 p-5 xl:border-r xl:border-fc-border">
                <Field label="Modèle">
                  <Select bind:value={selectedTemplate} onchange={handleTemplateChange} class="text-fc-sm">
                    {#each templates as template (template.id)}
                      <option value={template.id}>{template.name}</option>
                    {/each}
                  </Select>
                </Field>

                {#if selectedTemplate}
                  {@const template = templates.find(t => t.id === selectedTemplate)}
                  {#if template && template.variables.length > 0}
                    <div class="flex flex-col gap-3">
                      <p class="text-fc-xs text-fc-fg-muted">Variables</p>

                      {#each template.variables as variable, i (i)}
                        <Field label={variable.replace(/([A-Z])/g, ' $1').trim()} class="[&_label]:capitalize">
                          <Input
                            type="text"
                            bind:value={variables[variable]}
                            placeholder={variable.replace(/([A-Z])/g, ' $1').trim().toLowerCase()}
                            class="text-fc-sm"
                          />
                        </Field>
                      {/each}
                    </div>
                  {/if}
                {/if}

                <Button
                  onclick={sendEmail}
                  disabled={sending || !selectedTemplate || !smtpConfigured}
                  icon={sending ? undefined : 'solar:rocket-2-linear'}
                  class="w-full"
                >
                  {#if sending}
                    <Spinner size="sm" class="border-t-fc-accent-fg" />
                    Envoi...
                  {:else}
                    Envoyer l'e-mail
                  {/if}
                </Button>
              </div>

              <div class="flex flex-col gap-3 border-t border-fc-border p-5 xl:border-t-0">
                <div class="flex items-center justify-between">
                  <p class="text-fc-xs text-fc-fg-muted">Aperçu en direct</p>
                  {#if previewLoading}
                    <div class="flex items-center gap-1.5 text-fc-xs text-fc-fg-muted">
                      <Spinner size="sm" />
                      Mise à jour
                    </div>
                  {:else}
                    <Badge>EN DIRECT</Badge>
                  {/if}
                </div>

                {#if emailPreview.subject || emailPreview.html}
                  <div class="overflow-hidden rounded-fc-md border border-fc-border bg-fc-bg" class:opacity-60={previewLoading}>
                    <div class="border-b border-fc-border bg-fc-surface px-4 py-2.5">
                      <p class="mb-0.5 text-fc-xs text-fc-fg-muted">Objet</p>
                      <p class="text-fc-sm font-medium text-fc-fg">{emailPreview.subject || '—'}</p>
                    </div>
                    <div class="p-4">
                      {#if emailPreview.html}
                        <iframe title="Aperçu de l'email" sandbox="" srcdoc={previewDocument} class="h-[468px] w-full rounded-fc-md border-0 bg-white"></iframe>
                      {:else}
                        <p class="text-fc-sm text-fc-fg-muted italic">Remplissez les variables pour voir l'aperçu...</p>
                      {/if}
                    </div>
                  </div>
                {:else}
                  <EmptyState bare icon="solar:document-linear" title="Sélectionnez un modèle pour l'aperçu" class="rounded-fc-md border border-dashed border-fc-border py-10" />
                {/if}
              </div>
            </div>
          </Card>
        {:else}
          <EmptyState
            icon="solar:letter-linear"
            title="Aucune adresse e-mail"
            description="La prospection par e-mail n'est pas disponible pour ce lead."
          />
        {/if}

        <Card class="overflow-hidden p-0">
          <div class="flex items-center justify-between gap-3 border-b border-fc-border px-5 py-4">
            <h2 class="flex items-center gap-2 text-fc-lg font-semibold text-fc-fg">
              <iconify-icon icon="solar:history-linear" width="18" height="18" class="block"></iconify-icon>
              Historique des e-mails
            </h2>
            <Badge>{outreachHistory.length} e-mail{outreachHistory.length !== 1 ? 's' : ''}</Badge>
          </div>

          <div class="p-5">
            {#if outreachHistory.length === 0}
              <EmptyState bare icon="solar:inbox-line-linear" title="Aucun e-mail envoyé" class="py-10" />
            {:else}
              <div class="flex flex-col gap-2">
                {#each outreachHistory as email (email.id)}
                  <div class="overflow-hidden rounded-fc-md border border-fc-border" in:fade>
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
                      <div class="flex flex-col gap-3 border-t border-fc-border bg-fc-surface px-4 py-3" in:fly={{ y: -8, duration: 150 }}>
                        {#if email.error}
                          <Alert tone="danger" class="flex items-start gap-2 text-fc-xs">
                            <iconify-icon icon="solar:danger-triangle-linear" width="14" height="14" class="mt-0.5 block shrink-0"></iconify-icon>
                            <p>{email.error}</p>
                          </Alert>
                        {/if}

                        <div>
                          <p class="mb-1.5 text-fc-xs text-fc-fg-muted">Contenu de l'e-mail</p>
                          <div class="rounded-fc-md border border-fc-border bg-fc-bg p-3">
                            <p class="text-fc-sm leading-relaxed whitespace-pre-wrap text-fc-fg">{email.textBody || 'Aucun contenu'}</p>
                          </div>
                        </div>

                        {#if email.variables && Object.keys(email.variables).length > 0}
                          <div>
                            <p class="mb-1.5 text-fc-xs text-fc-fg-muted">Variables utilisées</p>
                            <div class="grid grid-cols-2 gap-2">
                              {#each Object.entries(email.variables) as [key, value] (key)}
                                <div class="rounded-fc-md border border-fc-border bg-fc-bg px-3 py-2">
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

