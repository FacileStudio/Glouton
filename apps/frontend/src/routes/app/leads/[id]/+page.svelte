<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { fade, fly } from 'svelte/transition';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import { Spinner } from '@repo/ui';
  import { getFaviconUrl, handleFaviconError } from '$lib/utils/favicon';
  import LeadLocationMap from '$lib/components/leads/LeadLocationMap.svelte';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import 'iconify-icon';

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

  let lead: Lead | null = null;
  let templates: EmailTemplate[] = [];
  let outreachHistory: EmailOutreach[] = [];
  let loading = true;
  let sending = false;
  let selectedTemplate = '';
  let variables: Record<string, string> = {};
  let emailPreview = { subject: '', html: '', text: '' };
  let previewLoading = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let expandedEmails: Set<string> = new Set();

  const leadId = $page.params.id;

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    try {
      const [leadData, templatesData, historyData] = await Promise.all([
        trpc.lead.query.getById.query({ leadId }),
        trpc.email.getTemplates.query(),
        trpc.email.getLeadOutreach.query({ leadId, teamId }),
      ]);

      lead = leadData;
      templates = templatesData;
      outreachHistory = historyData;

      if (templates.length > 0 && !selectedTemplate) {
        selectedTemplate = templates[0].id;
        updateVariables(templates[0]);
      }
    } catch (error) {
      toast.push('Échec du chargement du lead', 'error');
      console.error(error);
    } finally {
      loading = false;
    }
  }

  function updateVariables(template: EmailTemplate) {
    variables = {};
    template.variables.forEach((variable) => {
      if (variable === 'recipientName' && lead) {
        variables[variable] = lead.firstName || lead.businessName || lead.domain || '';
      } else if (variable === 'companyName' && lead) {
        variables[variable] = lead.businessName || lead.companyInfo?.name || lead.domain || '';
      } else {
        variables[variable] = '';
      }
    });
    updatePreview();
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

  function debouncedUpdatePreview() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => updatePreview(), 300);
  }

  $effect(() => {
    if (variables && selectedTemplate) debouncedUpdatePreview();
  });

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
    switch (status) {
      case 'SENT': return 'bg-blue-100 text-blue-700';
      case 'OPENED': return 'bg-purple-100 text-purple-700';
      case 'REPLIED': return 'bg-green-100 text-green-700';
      case 'FAILED': return 'bg-red-100 text-red-700';
      default: return 'bg-neutral-100 text-neutral-700';
    }
  }

  function getPriorityColor(status: Lead['status']): string {
    const colors = {
      HOT: 'bg-orange-100 text-orange-700',
      WARM: 'bg-yellow-100 text-yellow-700',
      COLD: 'bg-blue-100 text-blue-700',
    };
    return colors[status];
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
    if (p.includes('linkedin')) return { icon: 'mdi:linkedin', color: 'text-[#0A66C2]', bg: 'bg-[#E8F0FE]', label: 'LinkedIn' };
    if (p.includes('instagram')) return { icon: 'mdi:instagram', color: 'text-[#E1306C]', bg: 'bg-[#FDE8EF]', label: 'Instagram' };
    if (p.includes('facebook')) return { icon: 'mdi:facebook', color: 'text-[#1877F2]', bg: 'bg-[#E7F0FD]', label: 'Facebook' };
    if (p.includes('twitter') || p.includes('x.com') || p === 'x') return { icon: 'ri:twitter-x-fill', color: 'text-neutral-900', bg: 'bg-neutral-100', label: 'X / Twitter' };
    if (p.includes('tiktok')) return { icon: 'ic:baseline-tiktok', color: 'text-neutral-900', bg: 'bg-neutral-100', label: 'TikTok' };
    if (p.includes('youtube')) return { icon: 'mdi:youtube', color: 'text-[#FF0000]', bg: 'bg-[#FFE8E8]', label: 'YouTube' };
    if (p.includes('github')) return { icon: 'mdi:github', color: 'text-neutral-900', bg: 'bg-neutral-100', label: 'GitHub' };
    if (p.includes('pinterest')) return { icon: 'mdi:pinterest', color: 'text-[#E60023]', bg: 'bg-[#FFE8EA]', label: 'Pinterest' };
    if (p.includes('snapchat')) return { icon: 'mdi:snapchat', color: 'text-yellow-500', bg: 'bg-yellow-50', label: 'Snapchat' };
    if (p.includes('medium')) return { icon: 'mdi:medium', color: 'text-neutral-900', bg: 'bg-neutral-100', label: 'Medium' };
    if (p.includes('whatsapp')) return { icon: 'mdi:whatsapp', color: 'text-[#25D366]', bg: 'bg-[#E8FDF1]', label: 'WhatsApp' };
    if (p.includes('telegram')) return { icon: 'mdi:telegram', color: 'text-[#0088CC]', bg: 'bg-[#E6F5FF]', label: 'Telegram' };
    if (p.includes('discord')) return { icon: 'ic:baseline-discord', color: 'text-[#5865F2]', bg: 'bg-[#EDEFFE]', label: 'Discord' };
    if (p.includes('reddit')) return { icon: 'mdi:reddit', color: 'text-[#FF4500]', bg: 'bg-[#FFE9E0]', label: 'Reddit' };
    if (p.includes('threads')) return { icon: 'ri:threads-fill', color: 'text-neutral-900', bg: 'bg-neutral-100', label: 'Threads' };
    if (p.includes('mastodon')) return { icon: 'mdi:mastodon', color: 'text-[#6364FF]', bg: 'bg-[#EDEDFF]', label: 'Mastodon' };
    if (p.includes('bluesky') || p.includes('bsky')) return { icon: 'simple-icons:bluesky', color: 'text-[#0085FF]', bg: 'bg-[#E5F2FF]', label: 'Bluesky' };
    if (p.includes('vimeo')) return { icon: 'mdi:vimeo', color: 'text-[#1AB7EA]', bg: 'bg-[#E6F7FC]', label: 'Vimeo' };
    if (p.includes('behance')) return { icon: 'mdi:behance', color: 'text-[#1769FF]', bg: 'bg-[#E6EEFF]', label: 'Behance' };
    if (p.includes('dribbble')) return { icon: 'mdi:dribbble', color: 'text-[#EA4C89]', bg: 'bg-[#FDEAF2]', label: 'Dribbble' };
    if (p.includes('spotify')) return { icon: 'mdi:spotify', color: 'text-[#1DB954]', bg: 'bg-[#E8F5ED]', label: 'Spotify' };
    if (p.includes('soundcloud')) return { icon: 'mdi:soundcloud', color: 'text-[#FF5500]', bg: 'bg-[#FFE9E0]', label: 'SoundCloud' };
    if (p.includes('slack')) return { icon: 'mdi:slack', color: 'text-[#4A154B]', bg: 'bg-[#F3E6F4]', label: 'Slack' };
    if (p.includes('yelp')) return { icon: 'mdi:yelp', color: 'text-[#FF1A1A]', bg: 'bg-[#FFE6E6]', label: 'Yelp' };
    if (p.includes('tripadvisor')) return { icon: 'mdi:tripadvisor', color: 'text-[#00AF87]', bg: 'bg-[#E6F7F3]', label: 'TripAdvisor' };
    if (p.includes('twitch')) return { icon: 'mdi:twitch', color: 'text-[#9146FF]', bg: 'bg-[#F0EBFF]', label: 'Twitch' };
    return { icon: 'mdi:link-variant', color: 'text-neutral-600', bg: 'bg-neutral-100', label: platform };
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

  let technologies = $derived(lead?.technologies ?? []);
  let additionalEmails = $derived(lead?.additionalEmails ?? []);
  let phoneNumbers = $derived(lead?.phoneNumbers ?? []);
  let addresses = $derived(lead?.physicalAddresses ?? []);
  let socialProfiles = $derived(lead?.socialProfiles ?? []);
</script>

{#if loading}
  <div class="flex flex-col items-center justify-center h-screen space-y-6" in:fade>
    <Spinner size="xl" color="accent" />
  </div>
{:else if !lead}
  <div class="flex flex-col items-center justify-center h-screen space-y-6" in:fade>
    <iconify-icon icon="solar:close-circle-bold" width="64" class="text-red-400"></iconify-icon>
    <p class="text-lg font-black uppercase tracking-wide text-neutral-600">Lead introuvable</p>
    <button
      onclick={() => goto('/app/leads')}
      class="px-6 py-3 bg-black text-white rounded-xl font-bold hover:bg-neutral-800"
    >
      Retour aux leads
    </button>
  </div>
{:else}
  <div class="min-h-screen font-sans" style="background: #FAF7F5;" in:fade>

    <div class="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-neutral-200 px-6 py-4">
      <div class="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
        <div class="flex items-center gap-4 min-w-0">
          <button
            onclick={() => goto('/app/leads')}
            class="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors"
          >
            <iconify-icon icon="solar:arrow-left-bold" width="18"></iconify-icon>
          </button>

          <div class="w-10 h-10 flex-shrink-0 rounded-xl border border-neutral-200 bg-white flex items-center justify-center overflow-hidden shadow-sm">
            <img
              src={getFaviconUrl(lead.domain ?? '', 64)}
              alt="{lead.domain ?? ''} favicon"
              class="w-6 h-6"
              loading="lazy"
              onerror={(e) => handleFaviconError(e.currentTarget)}
            />
          </div>

          <div class="min-w-0">
            <h1 class="text-xl font-black tracking-tight text-neutral-900 truncate">{getDisplayName(lead)}</h1>
            {#if (lead.firstName || lead.lastName) && lead.domain}
              <p class="text-sm text-neutral-500 font-medium truncate">{lead.domain}{lead.position ? ` · ${lead.position}` : ''}</p>
            {:else if lead.position}
              <p class="text-sm text-neutral-500 font-medium truncate">{lead.position}</p>
            {/if}
          </div>
        </div>

        <div class="flex items-center gap-3 flex-shrink-0">
          <span class="px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide {getPriorityColor(lead.status)}">
            {lead.status}
          </span>

          {#if lead.contacted}
            <span class="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-black uppercase flex items-center gap-1.5">
              <iconify-icon icon="solar:check-circle-bold" width="14"></iconify-icon>
              Contacté
            </span>
          {:else}
            <span class="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-black uppercase flex items-center gap-1.5">
              <iconify-icon icon="solar:clock-circle-bold" width="14"></iconify-icon>
              Non contacté
            </span>
          {/if}

          {#if lead.email}
            <a
              href="#email-section"
              class="px-5 py-2.5 bg-black text-white rounded-xl text-sm font-bold hover:bg-neutral-800 transition-colors flex items-center gap-2"
            >
              <iconify-icon icon="solar:letter-bold" width="16"></iconify-icon>
              Envoyer un e-mail
            </a>
          {/if}
        </div>
      </div>
    </div>

    <div class="max-w-[1600px] mx-auto p-6 grid grid-cols-1 lg:grid-cols-5 gap-6">

      <div class="lg:col-span-2 space-y-4">

        <div class="rounded-3xl p-6 shadow-sm" style="background: #EFEAE6;">
          <div class="flex items-start gap-4">
            <div class="w-14 h-14 rounded-2xl bg-neutral-200 flex items-center justify-center flex-shrink-0 text-xl font-black text-neutral-500">
              {(lead.firstName?.[0] || lead.businessName?.[0] || lead.companyInfo?.name?.[0] || lead.domain?.[0] || '?').toUpperCase()}
            </div>
            <div class="flex-1 min-w-0">
              <h2 class="text-xl font-black text-neutral-900 truncate">{getDisplayName(lead)}</h2>
              {#if lead.position}
                <p class="text-sm font-semibold text-neutral-600 mt-0.5">{lead.position}</p>
              {/if}
              {#if lead.department}
                <p class="text-xs text-neutral-500 mt-0.5">{lead.department}</p>
              {/if}
              <div class="flex items-center gap-2 mt-3">
                <div class="flex-1 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                  <div
                    class="h-full transition-all {lead.score >= 70 ? 'bg-green-500' : lead.score >= 40 ? 'bg-yellow-400' : 'bg-orange-400'}"
                    style="width: {Math.min(lead.score, 100)}%"
                  ></div>
                </div>
                <span class="text-xs font-black text-neutral-700">{lead.score}/100</span>
              </div>
            </div>
          </div>

          <div class="mt-4 pt-4 border-t border-neutral-200/60 grid grid-cols-2 gap-3">
            <div>
              <p class="text-[9px] font-black uppercase tracking-widest text-neutral-400">E-mails envoyés</p>
              <p class="text-2xl font-black text-neutral-900 mt-0.5">{lead.emailsSentCount}</p>
            </div>
            <div>
              <p class="text-[9px] font-black uppercase tracking-widest text-neutral-400">Dernier contact</p>
              <p class="text-xs font-bold text-neutral-700 mt-0.5">{lead.lastContactedAt ? formatDate(lead.lastContactedAt) : '—'}</p>
            </div>
          </div>
        </div>

        <div class="rounded-3xl p-6 shadow-sm space-y-3" style="background: #EFEAE6;">
          <h3 class="text-[9px] font-black uppercase tracking-widest text-neutral-400 flex items-center gap-2">
            <iconify-icon icon="solar:user-id-bold" width="14"></iconify-icon>
            Coordonnées
          </h3>

          {#if lead.email}
            <a
              href="mailto:{lead.email}"
              class="flex items-center gap-3 px-4 py-3 bg-white hover:bg-neutral-50 rounded-2xl transition group"
            >
              <div class="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <iconify-icon icon="solar:letter-bold" width="16" class="text-blue-600"></iconify-icon>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[9px] font-black uppercase tracking-widest text-neutral-400">E-mail principal</p>
                <p class="text-sm font-bold text-blue-600 truncate group-hover:text-blue-800">{lead.email}</p>
              </div>
              {#if lead.emailVerified === true}
                <span title="Email vérifié le {lead.emailVerifiedAt ? formatDate(lead.emailVerifiedAt) : ''}" class="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-lg text-[9px] font-black uppercase">
                  <iconify-icon icon="solar:check-circle-bold" width="12"></iconify-icon>
                  Vérifié
                </span>
              {:else if lead.emailVerified === false}
                <span title="Email invalide ({lead.emailVerificationMethod ?? ''})" class="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-lg text-[9px] font-black uppercase">
                  <iconify-icon icon="solar:close-circle-bold" width="12"></iconify-icon>
                  Invalide
                </span>
              {:else}
                <span class="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 bg-neutral-100 text-neutral-400 rounded-lg text-[9px] font-black uppercase">
                  <iconify-icon icon="solar:question-circle-bold" width="12"></iconify-icon>
                  Non vérifié
                </span>
              {/if}
              <iconify-icon icon="solar:arrow-right-up-bold" width="14" class="text-neutral-400 flex-shrink-0"></iconify-icon>
            </a>
          {/if}

          {#each additionalEmails as email, i}
            <a
              href="mailto:{email}"
              class="flex items-center gap-3 px-4 py-3 bg-white hover:bg-neutral-50 rounded-2xl transition group"
            >
              <div class="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <iconify-icon icon="solar:letter-outline" width="16" class="text-blue-500"></iconify-icon>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[9px] font-black uppercase tracking-widest text-neutral-400">Email {i + 2}</p>
                <p class="text-sm font-medium text-blue-600 truncate group-hover:text-blue-800">{email}</p>
              </div>
              <iconify-icon icon="solar:arrow-right-up-bold" width="14" class="text-neutral-400 flex-shrink-0"></iconify-icon>
            </a>
          {/each}

          {#each phoneNumbers as phone}
            <a
              href="tel:{phone}"
              class="flex items-center gap-3 px-4 py-3 bg-white hover:bg-neutral-50 rounded-2xl transition group"
            >
              <div class="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <iconify-icon icon="solar:phone-bold" width="16" class="text-green-600"></iconify-icon>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[9px] font-black uppercase tracking-widest text-neutral-400">Téléphone</p>
                <p class="text-sm font-bold text-green-700 truncate group-hover:text-green-900">{phone}</p>
              </div>
              <iconify-icon icon="solar:arrow-right-up-bold" width="14" class="text-neutral-400 flex-shrink-0"></iconify-icon>
            </a>
          {/each}

          {#if lead.domain}
            <a
              href="https://{lead.domain}"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-3 px-4 py-3 bg-white hover:bg-neutral-50 rounded-2xl transition group"
            >
              <div class="w-8 h-8 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <iconify-icon icon="solar:global-bold" width="16" class="text-purple-600"></iconify-icon>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[9px] font-black uppercase tracking-widest text-neutral-400">Site web</p>
                <p class="text-sm font-bold text-purple-600 truncate group-hover:text-purple-800">{lead.domain}</p>
              </div>
              <iconify-icon icon="solar:arrow-right-up-bold" width="14" class="text-neutral-400 flex-shrink-0"></iconify-icon>
            </a>
          {/if}

          {#if lead.city || lead.country}
            <div class="flex items-center gap-3 px-4 py-3 bg-white rounded-2xl">
              <div class="w-8 h-8 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <iconify-icon icon="solar:map-point-bold" width="16" class="text-orange-600"></iconify-icon>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[9px] font-black uppercase tracking-widest text-neutral-400">Localisation</p>
                <p class="text-sm font-bold text-neutral-800 truncate">
                  {[lead.city, lead.country].filter(Boolean).join(', ')}
                </p>
              </div>
            </div>
          {/if}

          {#if !lead.email && additionalEmails.length === 0 && phoneNumbers.length === 0}
            <div class="px-4 py-3 bg-red-50 border border-red-100 rounded-2xl">
              <p class="text-xs font-bold text-red-600 flex items-center gap-2">
                <iconify-icon icon="solar:danger-triangle-bold" width="14"></iconify-icon>
                Aucune information de contact disponible
              </p>
            </div>
          {/if}
        </div>

        {#if lead.coordinates}
          <div class="rounded-3xl overflow-hidden shadow-sm" style="background: #EFEAE6;">
            <div class="px-6 pt-6 pb-3 flex items-center justify-between">
              <h3 class="text-[9px] font-black uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                <iconify-icon icon="solar:map-point-bold" width="14"></iconify-icon>
                Localisation sur la carte
              </h3>
              <a
                href={getGoogleMapsCoordsUrl(lead.coordinates.lat, lead.coordinates.lng)}
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-neutral-50 border border-neutral-200 rounded-xl text-[10px] font-black uppercase tracking-wide text-neutral-700 transition"
              >
                <iconify-icon icon="solar:map-arrow-right-bold" width="12" class="text-orange-500"></iconify-icon>
                Ouvrir dans Google Maps
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
          <div class="rounded-3xl p-6 shadow-sm" style="background: #EFEAE6;">
            <h3 class="text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-3 flex items-center gap-2">
              <iconify-icon icon="solar:share-bold" width="14"></iconify-icon>
              Profils sociaux
              <span class="ml-auto text-[9px] font-black px-2 py-0.5 bg-neutral-200 rounded-lg">{socialProfiles.length}</span>
            </h3>
            <div class="space-y-2">
              {#each socialProfiles as profile}
                {@const meta = getSocialMeta(profile.platform)}
                <a
                  href={profile.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center gap-3 px-4 py-3 bg-white hover:bg-neutral-50 rounded-2xl transition group"
                >
                  <div class="w-9 h-9 {meta.bg} rounded-xl flex items-center justify-center flex-shrink-0">
                    <iconify-icon icon={meta.icon} width="20" class="{meta.color}"></iconify-icon>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold text-neutral-800">{meta.label}</p>
                    <p class="text-[10px] text-neutral-400 truncate font-medium">{profile.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</p>
                  </div>
                  <iconify-icon icon="solar:arrow-right-up-bold" width="14" class="text-neutral-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"></iconify-icon>
                </a>
              {/each}
            </div>
          </div>
        {/if}

        {#if lead.companyInfo}
          <div class="rounded-3xl p-6 shadow-sm" style="background: #EFEAE6;">
            <h3 class="text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-4 flex items-center gap-2">
              <iconify-icon icon="solar:buildings-2-bold" width="14"></iconify-icon>
              Entreprise
            </h3>
            <div class="space-y-3">
              {#if lead.companyInfo.name}
                <div>
                  <p class="text-[9px] font-black uppercase tracking-widest text-neutral-400">Nom</p>
                  <p class="font-bold text-neutral-900 mt-0.5">{lead.companyInfo.name}</p>
                </div>
              {/if}
              <div class="grid grid-cols-2 gap-3">
                {#if lead.companyInfo.industry}
                  <div>
                    <p class="text-[9px] font-black uppercase tracking-widest text-neutral-400">Secteur</p>
                    <p class="text-sm font-semibold text-neutral-800 mt-0.5">{lead.companyInfo.industry}</p>
                  </div>
                {/if}
                {#if lead.companyInfo.size}
                  <div>
                    <p class="text-[9px] font-black uppercase tracking-widest text-neutral-400">Taille</p>
                    <p class="text-sm font-semibold text-neutral-800 mt-0.5">{lead.companyInfo.size}</p>
                  </div>
                {/if}
                {#if lead.companyInfo.founded}
                  <div>
                    <p class="text-[9px] font-black uppercase tracking-widest text-neutral-400">Fondée en</p>
                    <p class="text-sm font-semibold text-neutral-800 mt-0.5">{lead.companyInfo.founded}</p>
                  </div>
                {/if}
              </div>
              {#if lead.companyInfo.website}
                <div>
                  <p class="text-[9px] font-black uppercase tracking-widest text-neutral-400">Site web</p>
                  <a
                    href={lead.companyInfo.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-sm font-semibold text-blue-600 hover:text-blue-800 underline break-all mt-0.5 block"
                  >
                    {lead.companyInfo.website}
                  </a>
                </div>
              {/if}
              {#if lead.companyInfo.description}
                <div class="pt-2 border-t border-neutral-200/60">
                  <p class="text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-1">À propos</p>
                  <p class="text-sm text-neutral-700 leading-relaxed">{lead.companyInfo.description}</p>
                </div>
              {/if}
            </div>
          </div>
        {/if}


        {#if technologies.length > 0}
          <div class="rounded-3xl p-6 shadow-sm" style="background: #EFEAE6;">
            <h3 class="text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-3 flex items-center gap-2">
              <iconify-icon icon="solar:code-bold" width="14"></iconify-icon>
              Stack technique
            </h3>
            <div class="flex flex-wrap gap-2">
              {#each technologies as tech}
                <span class="px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-bold text-neutral-700 shadow-sm">
                  {tech}
                </span>
              {/each}
            </div>
          </div>
        {/if}

        {#if lead.scrapedAt || lead.auditedAt}
          <div class="rounded-2xl px-5 py-4 border border-neutral-200 bg-white/50">
            <div class="space-y-2">
              {#if lead.scrapedAt}
                <div class="flex items-center gap-2 text-xs text-neutral-500">
                  <iconify-icon icon="solar:refresh-bold" width="14"></iconify-icon>
                  <span>Collecté :</span>
                  <span class="font-bold text-neutral-700">{formatDate(lead.scrapedAt)}</span>
                </div>
              {/if}
              {#if lead.auditedAt}
                <div class="flex items-center gap-2 text-xs text-neutral-500">
                  <iconify-icon icon="solar:shield-check-bold" width="14"></iconify-icon>
                  <span>Audité :</span>
                  <span class="font-bold text-neutral-700">{formatDate(lead.auditedAt)}</span>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <div class="lg:col-span-3 space-y-6" id="email-section">

        {#if lead.email}
          <div class="rounded-3xl overflow-hidden shadow-sm" style="background: #EFEAE6;">
            <div class="px-8 py-6 bg-neutral-900 text-white">
              <h2 class="text-xl font-black tracking-tight flex items-center gap-3">
                <iconify-icon icon="solar:letter-bold" width="24"></iconify-icon>
                Prospection par e-mail
              </h2>
              <p class="text-neutral-400 text-sm mt-1 font-medium">
                Envoi à <span class="text-white font-bold">{lead.email}</span>
              </p>
            </div>

            <div class="grid grid-cols-1 xl:grid-cols-2 gap-0">
              <div class="p-8 space-y-5 border-r border-neutral-200/60">
                <div>
                  <label class="block text-[9px] font-black uppercase tracking-widest text-neutral-500 mb-2">
                    Modèle
                  </label>
                  <select
                    bind:value={selectedTemplate}
                    onchange={handleTemplateChange}
                    class="w-full px-4 py-3 bg-white border border-neutral-300 rounded-xl font-semibold text-sm outline-none focus:border-black transition"
                  >
                    {#each templates as template}
                      <option value={template.id}>{template.name}</option>
                    {/each}
                  </select>
                </div>

                {#if selectedTemplate}
                  {@const template = templates.find(t => t.id === selectedTemplate)}
                  {#if template && template.variables.length > 0}
                    <div class="space-y-3">
                      <p class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Variables</p>

                      {#each template.variables as variable}
                        <div>
                          <label class="block text-xs font-bold text-neutral-600 mb-1.5 capitalize">
                            {variable.replace(/([A-Z])/g, ' $1').trim()}
                          </label>
                          <input
                            type="text"
                            bind:value={variables[variable]}
                            placeholder="Enter {variable.replace(/([A-Z])/g, ' $1').trim().toLowerCase()}"
                            class="w-full px-4 py-2.5 bg-white border border-neutral-300 rounded-xl text-sm font-medium outline-none focus:border-black transition placeholder:text-neutral-400"
                          />
                        </div>
                      {/each}
                    </div>
                  {/if}
                {/if}

                <button
                  onclick={sendEmail}
                  disabled={sending || !selectedTemplate}
                  class="w-full bg-black text-white px-6 py-4 rounded-xl font-bold hover:bg-neutral-800 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {#if sending}
                    <Spinner size="sm" color="white" />
                    Envoi...
                  {:else}
                    <iconify-icon icon="solar:rocket-2-bold" width="18"></iconify-icon>
                    Envoyer l'e-mail
                  {/if}
                </button>
              </div>

              <div class="p-8 space-y-4">
                <div class="flex items-center justify-between">
                  <p class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Aperçu en direct</p>
                  {#if previewLoading}
                    <div class="flex items-center gap-1.5 text-xs text-neutral-400">
                      <Spinner size="xs" color="neutral" />
                      Mise à jour
                    </div>
                  {:else}
                    <span class="text-[9px] font-bold text-neutral-400 bg-neutral-200 px-2 py-0.5 rounded">EN DIRECT</span>
                  {/if}
                </div>

                {#if emailPreview.subject || emailPreview.html}
                  <div class="border border-neutral-200 rounded-2xl overflow-hidden bg-white shadow-sm" class:opacity-60={previewLoading}>
                    <div class="bg-neutral-50 border-b border-neutral-200 px-5 py-3">
                      <p class="text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-1">Objet</p>
                      <p class="font-bold text-sm text-neutral-900">{emailPreview.subject || '—'}</p>
                    </div>
                    <div class="p-5 max-h-[500px] overflow-y-auto">
                      <div class="email-preview">
                        {@html emailPreview.html || '<p class="text-neutral-400 italic text-sm">Fill in the variables to see the preview...</p>'}
                      </div>
                    </div>
                  </div>
                {:else}
                  <div class="border-2 border-dashed border-neutral-200 rounded-2xl p-12 text-center bg-neutral-50/50">
                    <iconify-icon icon="solar:document-bold" width="48" class="text-neutral-300 mb-3"></iconify-icon>
                    <p class="text-sm font-bold text-neutral-400">Sélectionnez un modèle pour l'aperçu</p>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {:else}
          <div class="rounded-3xl p-8 border-2 border-dashed border-neutral-300 text-center">
            <iconify-icon icon="solar:letter-bold" width="48" class="text-neutral-300 mb-3"></iconify-icon>
            <h3 class="text-lg font-black text-neutral-500">Aucune adresse e-mail</h3>
            <p class="text-sm text-neutral-400 mt-1">La prospection par e-mail n'est pas disponible pour ce lead.</p>
          </div>
        {/if}

        <div class="rounded-3xl overflow-hidden shadow-sm" style="background: #EFEAE6;">
          <div class="px-8 py-6 border-b border-neutral-200/60 flex items-center justify-between">
            <h2 class="text-lg font-black tracking-tight flex items-center gap-3">
              <iconify-icon icon="solar:history-bold" width="22"></iconify-icon>
              Historique des e-mails
            </h2>
            <span class="text-xs font-bold text-neutral-500 bg-white px-3 py-1.5 rounded-lg">
              {outreachHistory.length} e-mail{outreachHistory.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div class="p-6">
            {#if outreachHistory.length === 0}
              <div class="py-12 text-center">
                <iconify-icon icon="solar:inbox-line-bold" width="56" class="text-neutral-300 mb-3"></iconify-icon>
                <p class="text-sm font-bold text-neutral-400 uppercase tracking-widest">Aucun e-mail envoyé</p>
              </div>
            {:else}
              <div class="space-y-3">
                {#each outreachHistory as email}
                  <div class="bg-white rounded-2xl border border-neutral-200 overflow-hidden hover:border-neutral-300 transition-colors" in:fade>
                    <button
                      onclick={() => toggleEmailExpansion(email.id)}
                      class="w-full px-6 py-4 text-left hover:bg-neutral-50 transition-colors"
                    >
                      <div class="flex items-center justify-between gap-3">
                        <div class="flex-1 min-w-0">
                          <p class="font-bold text-sm text-neutral-900 truncate">{email.subject}</p>
                          <p class="text-xs text-neutral-500 mt-1 flex items-center gap-1.5">
                            <iconify-icon icon="solar:calendar-bold" width="12"></iconify-icon>
                            {formatDate(email.sentAt || email.createdAt)}
                          </p>
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0">
                          <span class="px-2.5 py-1 rounded-lg text-[10px] font-bold {getStatusColor(email.status)}">
                            {email.status}
                          </span>
                          <iconify-icon
                            icon={expandedEmails.has(email.id) ? "solar:alt-arrow-up-bold" : "solar:alt-arrow-down-bold"}
                            width="16"
                            class="text-neutral-400"
                          ></iconify-icon>
                        </div>
                      </div>
                    </button>

                    {#if expandedEmails.has(email.id)}
                      <div class="border-t border-neutral-100 px-6 py-4 bg-neutral-50/50 space-y-4" in:fly={{ y: -8, duration: 150 }}>
                        {#if email.error}
                          <div class="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-xl">
                            <iconify-icon icon="solar:danger-triangle-bold" width="16" class="text-red-500 flex-shrink-0 mt-0.5"></iconify-icon>
                            <p class="text-xs font-medium text-red-600">{email.error}</p>
                          </div>
                        {/if}

                        <div>
                          <p class="text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-2">Contenu de l'e-mail</p>
                          <div class="bg-white rounded-xl border border-neutral-200 p-4">
                            <p class="text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed">{email.textBody || 'Aucun contenu'}</p>
                          </div>
                        </div>

                        {#if email.variables && Object.keys(email.variables).length > 0}
                          <div>
                            <p class="text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-2">Variables utilisées</p>
                            <div class="grid grid-cols-2 gap-2">
                              {#each Object.entries(email.variables) as [key, value]}
                                <div class="bg-white rounded-lg border border-neutral-200 px-3 py-2">
                                  <p class="text-[9px] font-black uppercase tracking-widest text-neutral-400">{key}</p>
                                  <p class="text-sm text-neutral-800 font-medium mt-0.5">{value}</p>
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
