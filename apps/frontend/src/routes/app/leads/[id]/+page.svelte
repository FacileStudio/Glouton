<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { fade, fly } from 'svelte/transition';
  import DOMPurify from 'isomorphic-dompurify';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import { Spinner } from '@repo/ui';
  import { getFaviconUrl, handleFaviconError } from '$lib/utils/favicon';
  import LeadLocationMap from '$lib/components/leads/LeadLocationMap.svelte';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import 'iconify-icon';

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

  interface Address {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    fullAddress?: string;
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
    physicalAddresses: Address[] | null;
    socialProfiles: SocialProfile[] | null;
    companyInfo: CompanyInfo | null;
    websiteAudit: any | null;
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
    leadId: string;
    userId: string;
    templateId: string;
    subject: string;
    htmlBody: string;
    textBody: string;
    variables: Record<string, any>;
    status: string;
    sentAt: string | null;
    openedAt?: string | null;
    clickedAt?: string | null;
    repliedAt?: string | null;
    error?: string | null;
    createdAt: string;
  }

  let lead: Lead | null = $state(null);
  let templates: EmailTemplate[] = $state([]);
  let outreachHistory: EmailOutreach[] = $state([]);
  let loading = $state(true);
  let sending = $state(false);
  let selectedTemplate = $state('');
  let variables: Record<string, string> = $state({});
  let emailPreview = $state({ subject: '', html: '', text: '' });
  let previewLoading = $state(false);
  let expandedEmails: Set<string> = $state(new Set());
  let isInitialLoad = $state(true);
  let isFavorite = $state(false);
  let togglingFavorite = $state(false);
  let smtpConfigured = $state<boolean>(true);
  let checkingSmtp = $state(true);

  const leadId = $page.params.id;

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
      toast.push('Échec du chargement du lead', 'error');
      console.error(error);
    } finally {
      isInitialLoad = false;
      loading = false;
    }
  }

  async function checkSmtpConfiguration() {
    checkingSmtp = true;
    try {
      const config = await trpc.team.getSmtpConfig.query({ teamId });
      smtpConfigured = !!(config.smtpHost && config.smtpUser && config.smtpPass);
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
      toast.push("Ce lead n'a pas d'adresse e-mail", 'error');
      return;
    }

    const template = templates.find((t) => t.id === selectedTemplate);
    if (!template) {
      toast.push('Veuillez sélectionner un modèle', 'error');
      return;
    }

    for (const variable of template.variables) {
      if (!variables[variable]) {
        toast.push(`Veuillez remplir : ${variable}`, 'error');
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

      toast.push('E-mail envoyé avec succès !', 'success');
      await loadData();
    } catch (error: any) {
      toast.push(error?.message || "Échec de l'envoi de l'e-mail", 'error');
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

  function getStatusColor(status: string): string {
    if (status === 'FAILED') return 'bg-destructive/10 text-destructive';
    return 'bg-muted text-foreground';
  }

  function getPriorityColor(status: Lead['status']): string {
    if (status === 'HOT') return 'bg-destructive/10 text-destructive';
    return 'bg-muted text-foreground';
  }

  function toggleEmailExpansion(emailId: string) {
    expandedEmails = new Set(expandedEmails);
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
    const base = { color: 'text-foreground', bg: 'bg-muted' };
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

  function getSocialIcon(platform: string): string {
    return getSocialMeta(platform).icon;
  }

  function getGoogleMapsUrl(address: Address): string {
    const parts = [address.street, address.city, address.state, address.postalCode, address.country].filter(Boolean);
    const query = encodeURIComponent(address.fullAddress || parts.join(', '));
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
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
      toast.push(
        isFavorite ? 'Lead ajouté aux favoris' : 'Lead retiré des favoris',
        'success'
      );
    } catch (error) {
      toast.push('Échec de la mise à jour des favoris', 'error');
      console.error(error);
    } finally {
      togglingFavorite = false;
    }
  }

  let technologies = $derived(lead?.technologies ?? []);
  let additionalEmails = $derived(lead?.additionalEmails ?? []);
  let phoneNumbers = $derived(lead?.phoneNumbers ?? []);
  let addresses = $derived(lead?.physicalAddresses ?? []);
  let socialProfiles = $derived(lead?.socialProfiles ?? []);
  let sanitizedPreviewHtml = $derived(
    emailPreview.html
      ? DOMPurify.sanitize(emailPreview.html)
      : '<p class="text-muted-foreground italic text-sm">Fill in the variables to see the preview...</p>'
  );

  $effect(() => {
    const _ = [selectedTemplate, variables];
    if (!isInitialLoad && selectedTemplate) {
      updatePreview();
    }
  });
</script>

{#if loading}
  <div class="flex flex-col items-center justify-center h-screen space-y-4" in:fade>
    <Spinner size="xl" />
  </div>
{:else if !lead}
  <div class="flex flex-col items-center justify-center h-screen space-y-4" in:fade>
    <iconify-icon icon="solar:close-circle-linear" width="48" class="text-muted-foreground"></iconify-icon>
    <p class="text-sm font-medium text-foreground">Lead introuvable</p>
    <button
      onclick={() => goto('/app/leads')}
      class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
    >
      Retour aux leads
    </button>
  </div>
{:else}
  <div in:fade>

    <div class="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-6 py-3">
      <div class="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
        <div class="flex items-center gap-3 min-w-0">
          <button
            aria-label="Retour aux leads"
            onclick={() => goto('/app/leads')}
            class="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted transition-colors"
          >
            <iconify-icon icon="solar:arrow-left-linear" width="16"></iconify-icon>
          </button>

          <div class="size-8 flex-shrink-0 rounded-lg border border-border bg-background flex items-center justify-center overflow-hidden">
            <img
              src={getFaviconUrl(lead.domain ?? '', 64)}
              alt="{lead.domain ?? ''} favicon"
              class="w-5 h-5"
              loading="lazy"
              onerror={(e) => handleFaviconError(e.currentTarget)}
            />
          </div>

          <div class="min-w-0">
            <h1 class="text-lg font-semibold text-foreground truncate">{getDisplayName(lead)}</h1>
            {#if (lead.firstName || lead.lastName) && lead.domain}
              <p class="text-xs text-muted-foreground truncate">{lead.domain}{lead.position ? ` · ${lead.position}` : ''}</p>
            {:else if lead.position}
              <p class="text-xs text-muted-foreground truncate">{lead.position}</p>
            {/if}
          </div>
        </div>

        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getPriorityColor(lead.status)}">
            {lead.status}
          </span>

          {#if lead.contacted}
            <span class="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground gap-1">
              <iconify-icon icon="solar:check-circle-linear" width="12"></iconify-icon>
              Contacté
            </span>
          {:else}
            <span class="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground gap-1">
              <iconify-icon icon="solar:clock-circle-linear" width="12"></iconify-icon>
              Non contacté
            </span>
          {/if}

          <button
            onclick={toggleFavorite}
            disabled={togglingFavorite}
            class="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {#if togglingFavorite}
              <Spinner size="xs" />
            {:else}
              <iconify-icon icon={isFavorite ? "solar:heart-broken-linear" : "solar:heart-linear"} width="16"></iconify-icon>
            {/if}
            {isFavorite ? 'Retirer favori' : 'Ajouter favori'}
          </button>

          {#if lead.email}
            <a
              href="#email-section"
              class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
            >
              <iconify-icon icon="solar:letter-linear" width="16"></iconify-icon>
              Envoyer un e-mail
            </a>
          {/if}
        </div>
      </div>
    </div>

    <div class="max-w-[1600px] mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-5 gap-6">

      <div class="lg:col-span-2 space-y-6">

        <div class="rounded-xl border border-border bg-card p-6">
          <div class="flex items-start gap-4">
            <div class="size-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 text-lg font-semibold text-muted-foreground">
              {(lead.firstName?.[0] || lead.businessName?.[0] || lead.companyInfo?.name?.[0] || lead.domain?.[0] || '?').toUpperCase()}
            </div>
            <div class="flex-1 min-w-0">
              <h2 class="text-lg font-semibold text-foreground truncate">{getDisplayName(lead)}</h2>
              {#if lead.position}
                <p class="text-sm text-muted-foreground mt-0.5">{lead.position}</p>
              {/if}
              {#if lead.department}
                <p class="text-xs text-muted-foreground mt-0.5">{lead.department}</p>
              {/if}
              <div class="flex items-center gap-2 mt-3">
                <div class="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    class="h-full bg-foreground transition-all"
                    style="width: {Math.min(lead.score, 100)}%"
                  ></div>
                </div>
                <span class="text-xs font-medium text-foreground">{lead.score}/100</span>
              </div>
            </div>
          </div>

          <div class="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-3">
            <div>
              <p class="text-xs text-muted-foreground">E-mails envoyés</p>
              <p class="text-xl font-semibold text-foreground mt-0.5">{lead.emailsSentCount}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">Dernier contact</p>
              <p class="text-sm text-foreground mt-0.5">{lead.lastContactedAt ? formatDate(lead.lastContactedAt) : '—'}</p>
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-border bg-card p-6 space-y-3">
          <h3 class="text-lg font-semibold text-foreground flex items-center gap-2">
            <iconify-icon icon="solar:user-id-linear" width="18"></iconify-icon>
            Coordonnées
          </h3>

          {#if lead.email}
            <a
              href="mailto:{lead.email}"
              class="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-background hover:bg-muted transition-colors"
            >
              <div class="inline-flex size-8 items-center justify-center rounded-lg bg-muted text-foreground flex-shrink-0">
                <iconify-icon icon="solar:letter-linear" width="14"></iconify-icon>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-xs text-muted-foreground">E-mail principal</p>
                <p class="text-sm text-foreground truncate">{lead.email}</p>
              </div>
              {#if lead.emailVerified === true}
                <span title="Email vérifié le {lead.emailVerifiedAt ? formatDate(lead.emailVerifiedAt) : ''}" class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground flex-shrink-0">
                  <iconify-icon icon="solar:check-circle-linear" width="12"></iconify-icon>
                  Vérifié
                </span>
              {:else if lead.emailVerified === false}
                <span title="Email invalide ({lead.emailVerificationMethod ?? ''})" class="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive flex-shrink-0">
                  <iconify-icon icon="solar:close-circle-linear" width="12"></iconify-icon>
                  Invalide
                </span>
              {:else}
                <span class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground flex-shrink-0">
                  <iconify-icon icon="solar:question-circle-linear" width="12"></iconify-icon>
                  Non vérifié
                </span>
              {/if}
              <iconify-icon icon="solar:arrow-right-up-linear" width="14" class="text-muted-foreground flex-shrink-0"></iconify-icon>
            </a>
          {/if}

          {#each additionalEmails as email, i}
            <a
              href="mailto:{email}"
              class="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-background hover:bg-muted transition-colors"
            >
              <div class="inline-flex size-8 items-center justify-center rounded-lg bg-muted text-foreground flex-shrink-0">
                <iconify-icon icon="solar:letter-outline" width="14"></iconify-icon>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-xs text-muted-foreground">Email {i + 2}</p>
                <p class="text-sm text-foreground truncate">{email}</p>
              </div>
              <iconify-icon icon="solar:arrow-right-up-linear" width="14" class="text-muted-foreground flex-shrink-0"></iconify-icon>
            </a>
          {/each}

          {#each phoneNumbers as phone}
            <a
              href="tel:{phone}"
              class="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-background hover:bg-muted transition-colors"
            >
              <div class="inline-flex size-8 items-center justify-center rounded-lg bg-muted text-foreground flex-shrink-0">
                <iconify-icon icon="solar:phone-linear" width="14"></iconify-icon>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-xs text-muted-foreground">Téléphone</p>
                <p class="text-sm text-foreground truncate">{phone}</p>
              </div>
              <iconify-icon icon="solar:arrow-right-up-linear" width="14" class="text-muted-foreground flex-shrink-0"></iconify-icon>
            </a>
          {/each}

          {#if lead.domain}
            <a
              href="https://{lead.domain}"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-background hover:bg-muted transition-colors"
            >
              <div class="inline-flex size-8 items-center justify-center rounded-lg bg-muted text-foreground flex-shrink-0">
                <iconify-icon icon="solar:global-linear" width="14"></iconify-icon>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-xs text-muted-foreground">Site web</p>
                <p class="text-sm text-foreground truncate">{lead.domain}</p>
              </div>
              <iconify-icon icon="solar:arrow-right-up-linear" width="14" class="text-muted-foreground flex-shrink-0"></iconify-icon>
            </a>
          {/if}

          {#if lead.city || lead.country}
            <div class="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-background">
              <div class="inline-flex size-8 items-center justify-center rounded-lg bg-muted text-foreground flex-shrink-0">
                <iconify-icon icon="solar:map-point-linear" width="14"></iconify-icon>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-xs text-muted-foreground">Localisation</p>
                <p class="text-sm text-foreground truncate">
                  {[lead.city, lead.country].filter(Boolean).join(', ')}
                </p>
              </div>
            </div>
          {/if}

          {#if !lead.email && additionalEmails.length === 0 && phoneNumbers.length === 0}
            <div class="rounded-lg border border-border bg-destructive/10 px-3 py-2.5">
              <p class="text-xs text-destructive flex items-center gap-2">
                <iconify-icon icon="solar:danger-triangle-linear" width="14"></iconify-icon>
                Aucune information de contact disponible
              </p>
            </div>
          {/if}
        </div>

        {#if lead.coordinates}
          <div class="rounded-xl border border-border bg-card overflow-hidden">
            <div class="px-6 pt-6 pb-3 flex items-center justify-between gap-3">
              <h3 class="text-lg font-semibold text-foreground flex items-center gap-2">
                <iconify-icon icon="solar:map-point-linear" width="18"></iconify-icon>
                Localisation
              </h3>
              <a
                href={getGoogleMapsCoordsUrl(lead.coordinates.lat, lead.coordinates.lng)}
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium transition-colors hover:bg-muted"
              >
                <iconify-icon icon="solar:map-arrow-right-linear" width="12"></iconify-icon>
                Google Maps
              </a>
            </div>
            <div class="px-3 pb-3 h-56">
              <LeadLocationMap
                lat={lead.coordinates.lat}
                lng={lead.coordinates.lng}
                name={lead.businessName || lead.companyInfo?.name || lead.domain || getDisplayName(lead)}
              />
            </div>
          </div>
        {/if}

        {#if socialProfiles.length > 0}
          <div class="rounded-xl border border-border bg-card p-6">
            <h3 class="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <iconify-icon icon="solar:share-linear" width="18"></iconify-icon>
              Profils sociaux
              <span class="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">{socialProfiles.length}</span>
            </h3>
            <div class="space-y-2">
              {#each socialProfiles as profile}
                {@const meta = getSocialMeta(profile.platform)}
                <a
                  href={profile.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-background hover:bg-muted transition-colors group"
                >
                  <div class="inline-flex size-8 items-center justify-center rounded-lg {meta.bg} {meta.color} flex-shrink-0">
                    <iconify-icon icon={meta.icon} width="16"></iconify-icon>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-foreground">{meta.label}</p>
                    <p class="text-xs text-muted-foreground truncate">{profile.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</p>
                  </div>
                  <iconify-icon icon="solar:arrow-right-up-linear" width="14" class="text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"></iconify-icon>
                </a>
              {/each}
            </div>
          </div>
        {/if}

        {#if lead.companyInfo}
          <div class="rounded-xl border border-border bg-card p-6">
            <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <iconify-icon icon="solar:buildings-2-linear" width="18"></iconify-icon>
              Entreprise
            </h3>
            <div class="space-y-3">
              {#if lead.companyInfo.name}
                <div>
                  <p class="text-xs text-muted-foreground">Nom</p>
                  <p class="text-sm font-medium text-foreground mt-0.5">{lead.companyInfo.name}</p>
                </div>
              {/if}
              <div class="grid grid-cols-2 gap-3">
                {#if lead.companyInfo.industry}
                  <div>
                    <p class="text-xs text-muted-foreground">Secteur</p>
                    <p class="text-sm text-foreground mt-0.5">{lead.companyInfo.industry}</p>
                  </div>
                {/if}
                {#if lead.companyInfo.size}
                  <div>
                    <p class="text-xs text-muted-foreground">Taille</p>
                    <p class="text-sm text-foreground mt-0.5">{lead.companyInfo.size}</p>
                  </div>
                {/if}
                {#if lead.companyInfo.founded}
                  <div>
                    <p class="text-xs text-muted-foreground">Fondée en</p>
                    <p class="text-sm text-foreground mt-0.5">{lead.companyInfo.founded}</p>
                  </div>
                {/if}
              </div>
              {#if lead.companyInfo.website}
                <div>
                  <p class="text-xs text-muted-foreground">Site web</p>
                  <a
                    href={lead.companyInfo.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-sm text-foreground hover:underline break-all mt-0.5 block"
                  >
                    {lead.companyInfo.website}
                  </a>
                </div>
              {/if}
              {#if lead.companyInfo.description}
                <div class="pt-3 border-t border-border">
                  <p class="text-xs text-muted-foreground mb-1">À propos</p>
                  <p class="text-sm text-foreground leading-relaxed">{lead.companyInfo.description}</p>
                </div>
              {/if}
            </div>
          </div>
        {/if}


        {#if technologies.length > 0}
          <div class="rounded-xl border border-border bg-card p-6">
            <h3 class="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <iconify-icon icon="solar:code-linear" width="18"></iconify-icon>
              Stack technique
            </h3>
            <div class="flex flex-wrap gap-1.5">
              {#each technologies as tech}
                <span class="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                  {tech}
                </span>
              {/each}
            </div>
          </div>
        {/if}

        {#if lead.scrapedAt || lead.auditedAt}
          <div class="rounded-xl border border-border bg-card px-5 py-4">
            <div class="space-y-2">
              {#if lead.scrapedAt}
                <div class="flex items-center gap-2 text-xs text-muted-foreground">
                  <iconify-icon icon="solar:refresh-linear" width="14"></iconify-icon>
                  <span>Collecté :</span>
                  <span class="text-foreground font-medium">{formatDate(lead.scrapedAt)}</span>
                </div>
              {/if}
              {#if lead.auditedAt}
                <div class="flex items-center gap-2 text-xs text-muted-foreground">
                  <iconify-icon icon="solar:shield-check-linear" width="14"></iconify-icon>
                  <span>Audité :</span>
                  <span class="text-foreground font-medium">{formatDate(lead.auditedAt)}</span>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <div class="lg:col-span-3 space-y-6" id="email-section">

        {#if lead.email}
          <div class="rounded-xl border border-border bg-card overflow-hidden">
            <div class="px-6 py-5 border-b border-border">
              <h2 class="text-lg font-semibold text-foreground flex items-center gap-2">
                <iconify-icon icon="solar:letter-linear" width="20"></iconify-icon>
                Prospection par e-mail
              </h2>
              <p class="text-sm text-muted-foreground mt-1">
                Envoi à <span class="text-foreground font-medium">{lead.email}</span>
              </p>
            </div>

            {#if !checkingSmtp && !smtpConfigured}
              <div class="mx-6 mt-4 rounded-lg border border-border bg-muted/40 p-4 flex items-start gap-3">
                <iconify-icon icon="solar:danger-triangle-linear" width="18" class="text-muted-foreground flex-shrink-0"></iconify-icon>
                <div class="flex-1">
                  <p class="text-sm font-medium text-foreground mb-1">Configuration SMTP manquante</p>
                  <p class="text-xs text-muted-foreground leading-relaxed mb-2">
                    Vous devez configurer vos paramètres SMTP pour pouvoir envoyer des e-mails.
                  </p>
                  <button
                    onclick={() => goto(settingsUrl)}
                    class="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/85"
                  >
                    <iconify-icon icon="solar:settings-linear" width="14"></iconify-icon>
                    Configurer SMTP
                  </button>
                </div>
              </div>
            {/if}

            <div class="grid grid-cols-1 xl:grid-cols-2 gap-0">
              <div class="p-6 space-y-4 xl:border-r border-border">
                <label class="block">
                  <span class="block text-xs text-muted-foreground mb-1.5">
                    Modèle
                  </span>
                  <select
                    bind:value={selectedTemplate}
                    onchange={handleTemplateChange}
                    class="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring transition-colors"
                  >
                    {#each templates as template}
                      <option value={template.id}>{template.name}</option>
                    {/each}
                  </select>
                </label>

                {#if selectedTemplate}
                  {@const template = templates.find(t => t.id === selectedTemplate)}
                  {#if template && template.variables.length > 0}
                    <div class="space-y-3">
                      <p class="text-xs text-muted-foreground">Variables</p>

                      {#each template.variables as variable}
                        <label class="block">
                          <span class="block text-xs text-muted-foreground mb-1.5 capitalize">
                            {variable.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                          <input
                            type="text"
                            bind:value={variables[variable]}
                            placeholder={variable.replace(/([A-Z])/g, ' $1').trim().toLowerCase()}
                            class="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground outline-none focus:border-ring transition-colors"
                          />
                        </label>
                      {/each}
                    </div>
                  {/if}
                {/if}

                <button
                  onclick={sendEmail}
                  disabled={sending || !selectedTemplate || !smtpConfigured}
                  class="w-full inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {#if sending}
                    <Spinner size="sm" color="white" />
                    Envoi...
                  {:else}
                    <iconify-icon icon="solar:rocket-2-linear" width="16"></iconify-icon>
                    Envoyer l'e-mail
                  {/if}
                </button>
              </div>

              <div class="p-6 space-y-3 border-t xl:border-t-0 border-border">
                <div class="flex items-center justify-between">
                  <p class="text-xs text-muted-foreground">Aperçu en direct</p>
                  {#if previewLoading}
                    <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Spinner size="xs" color="neutral" />
                      Mise à jour
                    </div>
                  {:else}
                    <span class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">EN DIRECT</span>
                  {/if}
                </div>

                {#if emailPreview.subject || emailPreview.html}
                  <div class="rounded-lg border border-border bg-background overflow-hidden" class:opacity-60={previewLoading}>
                    <div class="border-b border-border bg-muted/40 px-4 py-2.5">
                      <p class="text-xs text-muted-foreground mb-0.5">Objet</p>
                      <p class="text-sm font-medium text-foreground">{emailPreview.subject || '—'}</p>
                    </div>
                    <div class="p-4 max-h-[500px] overflow-y-auto">
                      <div class="email-preview">
                        {@html sanitizedPreviewHtml}
                      </div>
                    </div>
                  </div>
                {:else}
                  <div class="rounded-lg border border-dashed border-border p-10 text-center">
                    <iconify-icon icon="solar:document-linear" width="32" class="text-muted-foreground mb-2"></iconify-icon>
                    <p class="text-sm text-muted-foreground">Sélectionnez un modèle pour l'aperçu</p>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {:else}
          <div class="rounded-xl border border-dashed border-border p-8 text-center">
            <iconify-icon icon="solar:letter-linear" width="32" class="text-muted-foreground mb-2"></iconify-icon>
            <h3 class="text-sm font-medium text-foreground">Aucune adresse e-mail</h3>
            <p class="text-sm text-muted-foreground mt-1">La prospection par e-mail n'est pas disponible pour ce lead.</p>
          </div>
        {/if}

        <div class="rounded-xl border border-border bg-card overflow-hidden">
          <div class="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 class="text-lg font-semibold text-foreground flex items-center gap-2">
              <iconify-icon icon="solar:history-linear" width="18"></iconify-icon>
              Historique des e-mails
            </h2>
            <span class="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
              {outreachHistory.length} e-mail{outreachHistory.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div class="p-6">
            {#if outreachHistory.length === 0}
              <div class="py-10 text-center">
                <iconify-icon icon="solar:inbox-line-linear" width="40" class="text-muted-foreground mb-2"></iconify-icon>
                <p class="text-sm text-muted-foreground">Aucun e-mail envoyé</p>
              </div>
            {:else}
              <div class="space-y-2">
                {#each outreachHistory as email}
                  <div class="rounded-lg border border-border bg-background overflow-hidden" in:fade>
                    <button
                      onclick={() => toggleEmailExpansion(email.id)}
                      class="w-full px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                    >
                      <div class="flex items-center justify-between gap-3">
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-medium text-foreground truncate">{email.subject}</p>
                          <p class="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                            <iconify-icon icon="solar:calendar-linear" width="12"></iconify-icon>
                            {formatDate(email.sentAt || email.createdAt)}
                          </p>
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0">
                          <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusColor(email.status)}">
                            {email.status}
                          </span>
                          <iconify-icon
                            icon={expandedEmails.has(email.id) ? "solar:alt-arrow-up-linear" : "solar:alt-arrow-down-linear"}
                            width="14"
                            class="text-muted-foreground"
                          ></iconify-icon>
                        </div>
                      </div>
                    </button>

                    {#if expandedEmails.has(email.id)}
                      <div class="border-t border-border px-4 py-3 bg-muted/40 space-y-3" in:fly={{ y: -8, duration: 150 }}>
                        {#if email.error}
                          <div class="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-border bg-destructive/10">
                            <iconify-icon icon="solar:danger-triangle-linear" width="14" class="text-destructive flex-shrink-0 mt-0.5"></iconify-icon>
                            <p class="text-xs text-destructive">{email.error}</p>
                          </div>
                        {/if}

                        <div>
                          <p class="text-xs text-muted-foreground mb-1.5">Contenu de l'e-mail</p>
                          <div class="rounded-lg border border-border bg-background p-3">
                            <p class="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{email.textBody || 'Aucun contenu'}</p>
                          </div>
                        </div>

                        {#if email.variables && Object.keys(email.variables).length > 0}
                          <div>
                            <p class="text-xs text-muted-foreground mb-1.5">Variables utilisées</p>
                            <div class="grid grid-cols-2 gap-2">
                              {#each Object.entries(email.variables) as [key, value]}
                                <div class="rounded-lg border border-border bg-background px-3 py-2">
                                  <p class="text-xs text-muted-foreground">{key}</p>
                                  <p class="text-sm text-foreground mt-0.5">{value}</p>
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
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(.email-preview) {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    line-height: 1.6;
    color: #333;
    font-size: 14px;
  }
  :global(.email-preview p) { margin-bottom: 0.875em; }
  :global(.email-preview h1),
  :global(.email-preview h2),
  :global(.email-preview h3) { margin-top: 1.25em; margin-bottom: 0.5em; }
  :global(.email-preview .container) { max-width: 100%; margin: 0 auto; }
  :global(.email-preview .header) { padding: 20px; border-radius: 8px 8px 0 0; }
  :global(.email-preview .content) { padding: 20px; border-radius: 0 0 8px 8px; }
  :global(.email-preview .footer) { text-align: center; margin-top: 20px; font-size: 11px; }
</style>
