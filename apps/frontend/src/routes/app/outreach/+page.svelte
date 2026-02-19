<script lang="ts">
  import { fade, slide } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { goto, replaceState } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import { Spinner, Skeleton } from '@repo/ui';
  import { getFaviconUrl, handleFaviconError } from '$lib/utils/favicon';
  import 'iconify-icon';

  interface OutreachLead {
    leadId: string;
    firstName: string | null;
    lastName: string | null;
    domain: string | null;
    businessName: string | null;
    email: string | null;
    score: number;
    status: 'HOT' | 'WARM' | 'COLD';
    emailsSentCount: number;
    lastContactedAt: string | null;
    lastEmailId: string;
    lastEmailSubject: string;
    lastEmailStatus: string;
    lastEmailSentAt: string | null;
    lastEmailCreatedAt: string;
    daysSinceLastContact: number;
    needsFollowUp: boolean;
  }

  interface EmailTemplate {
    id: string;
    name: string;
    subject: string;
    variables: string[];
  }

  interface EmailHistory {
    id: string;
    subject: string;
    status: string;
    sentAt: string | null;
    createdAt: string;
    textBody: string;
    error?: string | null;
  }

  interface Stats {
    totalEmails: number;
    sentEmails: number;
    openedEmails: number;
    repliedEmails: number;
    contactedLeads: number;
    needsFollowUp: number;
    openRate: number;
    replyRate: number;
  }

  let outreachLeads: OutreachLead[] = [];
  let stats: Stats | null = null;
  let templates: EmailTemplate[] = [];
  let initialLoading = true;
  let activeTab: 'all' | 'followup' | 'pending' | 'replied' = 'all';
  let search = '';
  let mounted = false;

  function syncToUrl() {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (activeTab !== 'all') params.set('tab', activeTab);
    const qs = params.toString();
    replaceState(qs ? `?${qs}` : location.pathname, {});
  }

  $: if (mounted) {
    search;
    activeTab;
    syncToUrl();
  }

  let expandedLeadId: string | null = null;
  let panelHistory: EmailHistory[] = [];
  let panelLoading = false;
  let expandedEmailId: string | null = null;

  let selectedTemplate = '';
  let composeVariables: Record<string, string> = {};
  let sending = false;

  onMount(async () => {
    const params = new URLSearchParams(location.search);
    search = params.get('search') || '';
    const tab = params.get('tab');
    if (tab === 'followup' || tab === 'pending' || tab === 'replied') activeTab = tab;

    await loadData();
    mounted = true;
  });

  async function loadData() {
    initialLoading = true;
    try {
      const [outreachData, statsData, templatesData] = await Promise.all([
        trpc.email.getAllOutreach.query(),
        trpc.email.getStats.query(),
        trpc.email.getTemplates.query(),
      ]);
      outreachLeads = outreachData as OutreachLead[];
      stats = statsData as Stats;
      templates = templatesData;
    } catch (error) {
      toast.push('Échec du chargement des données de prospection', 'error');
      console.error(error);
    } finally {
      initialLoading = false;
    }
  }

  async function togglePanel(lead: OutreachLead) {
    if (expandedLeadId === lead.leadId) {
      expandedLeadId = null;
      expandedEmailId = null;
      return;
    }
    expandedLeadId = lead.leadId;
    expandedEmailId = null;
    selectedTemplate = templates[0]?.id ?? '';
    composeVariables = {};
    if (templates[0]) initVariables(templates[0], lead);
    panelLoading = true;
    try {
      panelHistory = (await trpc.email.getLeadOutreach.query({ leadId: lead.leadId })) as EmailHistory[];
    } catch {
      toast.push("Échec du chargement de l'historique", 'error');
    } finally {
      panelLoading = false;
    }
  }

  function initVariables(template: EmailTemplate, lead: OutreachLead) {
    composeVariables = {};
    template.variables.forEach((v) => {
      if (v === 'recipientName') composeVariables[v] = lead.firstName || lead.domain || '';
      else if (v === 'companyName') composeVariables[v] = lead.businessName || lead.domain || '';
      else composeVariables[v] = '';
    });
  }

  function handleTemplateChange(lead: OutreachLead) {
    const tpl = templates.find((t) => t.id === selectedTemplate);
    if (tpl) initVariables(tpl, lead);
  }

  async function sendFromPanel(lead: OutreachLead) {
    if (!lead.email) {
      toast.push("Ce lead n'a pas d'adresse e-mail", 'error');
      return;
    }
    const template = templates.find((t) => t.id === selectedTemplate);
    if (!template) {
      toast.push('Sélectionnez un modèle', 'error');
      return;
    }
    for (const v of template.variables) {
      if (!composeVariables[v]) {
        toast.push(`Veuillez remplir : ${v}`, 'error');
        return;
      }
    }
    sending = true;
    try {
      await trpc.email.sendEmail.mutate({
        leadId: lead.leadId,
        templateId: selectedTemplate,
        variables: composeVariables,
      });
      toast.push('E-mail envoyé avec succès !', 'success');
      panelHistory = (await trpc.email.getLeadOutreach.query({ leadId: lead.leadId })) as EmailHistory[];
      await loadData();
    } catch (e: any) {
      toast.push(e?.message || "Échec de l'envoi", 'error');
    } finally {
      sending = false;
    }
  }

  function getLeadName(lead: OutreachLead): string {
    const parts = [lead.firstName, lead.lastName].filter(Boolean);
    if (parts.length > 0) return parts.join(' ');
    return lead.businessName || lead.domain || lead.email || '—';
  }

  function getLeadSubtitle(lead: OutreachLead): string {
    const hasName = lead.firstName || lead.lastName;
    if (hasName && lead.domain) return lead.domain;
    return lead.email || '';
  }

  function getFaviconSource(lead: OutreachLead): string {
    return lead.domain || lead.email?.split('@')[1] || '';
  }

  function formatDays(days: number): string {
    const d = Math.floor(Number(days));
    if (d === 0) return "Aujourd'hui";
    if (d === 1) return 'Hier';
    return `Il y a ${d}j`;
  }

  function formatDate(date: string | null): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getEmailStatusConfig(status: string, needsFollowUp: boolean) {
    if (needsFollowUp) return { label: 'À relancer', cls: 'bg-amber-100 text-amber-700' };
    switch (status) {
      case 'REPLIED': return { label: 'Répondu', cls: 'bg-green-100 text-green-700' };
      case 'OPENED': return { label: 'Ouvert', cls: 'bg-purple-100 text-purple-700' };
      case 'CLICKED': return { label: 'Cliqué', cls: 'bg-indigo-100 text-indigo-700' };
      case 'SENT': return { label: 'Envoyé', cls: 'bg-blue-100 text-blue-700' };
      case 'FAILED': return { label: 'Échoué', cls: 'bg-red-100 text-red-700' };
      case 'BOUNCED': return { label: 'Rejeté', cls: 'bg-red-100 text-red-700' };
      default: return { label: status, cls: 'bg-neutral-100 text-neutral-700' };
    }
  }

  function getLeadStatusColor(status: string): string {
    const map: Record<string, string> = {
      HOT: 'bg-orange-100 text-orange-700',
      WARM: 'bg-yellow-100 text-yellow-700',
      COLD: 'bg-blue-100 text-blue-700',
    };
    return map[status] ?? 'bg-neutral-100 text-neutral-700';
  }

  function getHistoryStatusIcon(status: string): string {
    switch (status) {
      case 'REPLIED': return 'solar:reply-bold';
      case 'OPENED': return 'solar:eye-bold';
      case 'CLICKED': return 'solar:cursor-bold';
      case 'SENT': return 'solar:letter-bold';
      case 'FAILED': case 'BOUNCED': return 'solar:danger-triangle-bold';
      default: return 'solar:clock-circle-bold';
    }
  }

  function getHistoryStatusColor(status: string): string {
    switch (status) {
      case 'REPLIED': return 'text-green-600 bg-green-100';
      case 'OPENED': return 'text-purple-600 bg-purple-100';
      case 'CLICKED': return 'text-indigo-600 bg-indigo-100';
      case 'SENT': return 'text-blue-600 bg-blue-100';
      case 'FAILED': case 'BOUNCED': return 'text-red-600 bg-red-100';
      default: return 'text-neutral-500 bg-neutral-100';
    }
  }

  $: followUpLeads = outreachLeads.filter((l) => l.needsFollowUp);
  $: pendingLeads = outreachLeads.filter(
    (l) => !l.needsFollowUp && (l.lastEmailStatus === 'SENT' || l.lastEmailStatus === 'OPENED'),
  );
  $: repliedLeads = outreachLeads.filter((l) => l.lastEmailStatus === 'REPLIED');
  $: tabLeads =
    activeTab === 'all'
      ? outreachLeads
      : activeTab === 'followup'
        ? followUpLeads
        : activeTab === 'pending'
          ? pendingLeads
          : repliedLeads;
  $: filteredLeads = search
    ? tabLeads.filter((l) => {
        const s = search.toLowerCase();
        return (
          l.domain?.toLowerCase().includes(s) ||
          l.email?.toLowerCase().includes(s) ||
          l.firstName?.toLowerCase().includes(s) ||
          l.lastName?.toLowerCase().includes(s) ||
          l.businessName?.toLowerCase().includes(s)
        );
      })
    : tabLeads;

  $: expandedLead = outreachLeads.find((l) => l.leadId === expandedLeadId) ?? null;
</script>

<div
  class="p-6 lg:p-12 max-w-[1600px] mx-auto space-y-10 selection:text-black font-sans"
  style="background-color: #FAF7F5; selection-background-color: #FEC129;"
>
  <div class="flex items-center gap-4">
    <div class="w-16 h-16 flex items-center justify-center bg-neutral-900 rounded-2xl">
      <iconify-icon icon="solar:letter-bold" width="32" class="text-white"></iconify-icon>
    </div>
    <div class="space-y-1">
      <h1 class="text-5xl font-black tracking-tight leading-none" style="color: #291334;">
        Prospection<span style="color: #FEC129;">.</span>
      </h1>
      <p class="text-neutral-400 font-medium text-sm">Historique des e-mails, relances et réponses</p>
    </div>
  </div>

  <section class="grid grid-cols-1 sm:grid-cols-3 gap-6">
    {#if initialLoading}
      {#each Array(3) as _}
        <div class="p-8 rounded-[32px] shadow-lg" style="background-color: #EFEAE6;">
          <div class="flex items-start justify-between mb-6">
            <Skeleton width="120px" height="1.5rem" rounded="md" />
            <Skeleton width="52px" height="52px" rounded="2xl" />
          </div>
          <Skeleton width="80px" height="3.5rem" rounded="md" />
        </div>
      {/each}
    {:else}
      {#each [
        {
          label: 'Total envoyés',
          val: (stats?.totalEmails ?? 0).toString(),
          icon: 'solar:letter-bold-duotone',
          color: 'text-black',
          accent: null,
        },
        {
          label: 'Leads contactés',
          val: (stats?.contactedLeads ?? 0).toString(),
          icon: 'solar:users-group-rounded-bold-duotone',
          color: 'text-blue-500',
          accent: null,
        },
        {
          label: 'À relancer',
          val: (stats?.needsFollowUp ?? 0).toString(),
          icon: 'solar:bell-bing-bold-duotone',
          color: (stats?.needsFollowUp ?? 0) > 0 ? 'text-amber-500' : 'text-neutral-400',
          accent: (stats?.needsFollowUp ?? 0) > 0,
        },
      ] as stat}
        <div
          class="p-8 rounded-[32px] shadow-lg hover:shadow-xl transition-shadow {stat.accent ? 'ring-2 ring-amber-300' : ''}"
          style="background-color: #EFEAE6;"
        >
          <div class="flex items-start justify-between mb-6">
            <h3 class="text-lg font-bold text-neutral-700">{stat.label}</h3>
            <div class="w-14 h-14 bg-neutral-50 rounded-2xl flex items-center justify-center flex-shrink-0">
              <iconify-icon icon={stat.icon} class={stat.color} width="28"></iconify-icon>
            </div>
          </div>
          <p class="text-5xl font-black tracking-tighter {stat.accent ? 'text-amber-600' : ''}">{stat.val}</p>
        </div>
      {/each}
    {/if}
  </section>

  <!-- Filter Bar -->
  <div class="rounded-[28px] shadow-lg p-5 space-y-4" style="background-color: #EFEAE6;">
    <!-- Search -->
    <div class="relative">
      <iconify-icon
        icon="solar:magnifer-bold"
        width="18"
        class="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
      ></iconify-icon>
      <input
        type="text"
        bind:value={search}
        placeholder="Rechercher par nom, e-mail, domaine..."
        class="w-full h-12 pl-11 pr-10 bg-white rounded-2xl border border-neutral-200 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 outline-none font-medium text-sm placeholder:text-neutral-400 transition-all"
      />
      {#if search}
        <button
          onclick={() => (search = '')}
          class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black transition-colors"
        >
          <iconify-icon icon="solar:close-circle-bold" width="18"></iconify-icon>
        </button>
      {/if}
    </div>

    <!-- Tab pills -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-1.5">
        {#each [
          { key: 'all', label: 'Tous', count: outreachLeads.length },
          { key: 'followup', label: 'À relancer', count: followUpLeads.length },
          { key: 'pending', label: 'En attente', count: pendingLeads.length },
          { key: 'replied', label: 'Répondu', count: repliedLeads.length },
        ] as tab}
          <button
            onclick={() => { activeTab = tab.key as typeof activeTab; expandedLeadId = null; }}
            class="h-9 pl-3.5 pr-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 {activeTab === tab.key
              ? 'bg-neutral-900 text-white shadow-sm'
              : 'bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-400 hover:text-neutral-900'}"
          >
            {tab.label}
            <span
              class="text-[10px] px-1.5 py-0.5 rounded-lg font-black {activeTab === tab.key
                ? 'bg-white/20 text-white'
                : tab.key === 'followup' && tab.count > 0
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-neutral-100 text-neutral-500'}"
            >
              {tab.count}
            </span>
          </button>
        {/each}
      </div>
      <p class="text-xs font-medium text-neutral-400">Seuil de relance : 5 jours</p>
    </div>
  </div>

  <section class="rounded-[40px] overflow-hidden shadow-lg" style="background-color: #EFEAE6;">

    {#if initialLoading}
      <div class="p-8 space-y-3">
        {#each Array(5) as _}
          <div class="flex items-center gap-4 p-4 bg-white rounded-2xl">
            <Skeleton width="40px" height="40px" rounded="xl" />
            <div class="flex-1 space-y-2">
              <Skeleton width="200px" height="1rem" rounded="md" />
              <Skeleton width="140px" height="0.75rem" rounded="md" />
            </div>
            <Skeleton width="80px" height="1.5rem" rounded="lg" />
            <Skeleton width="60px" height="1rem" rounded="md" />
          </div>
        {/each}
      </div>
    {:else if filteredLeads.length === 0}
      <div class="flex flex-col items-center justify-center py-24 space-y-4">
        <iconify-icon icon="solar:inbox-line-bold" width="80" class="text-neutral-200"></iconify-icon>
        <p class="text-neutral-400 font-bold uppercase tracking-widest text-sm">
          {activeTab === 'all'
            ? 'Aucun e-mail envoyé'
            : activeTab === 'followup'
              ? 'Aucune relance nécessaire'
              : activeTab === 'pending'
                ? 'Aucun contact en attente'
                : 'Aucune réponse'}
        </p>
        {#if activeTab === 'all'}
          <button
            onclick={() => goto('/app/leads')}
            class="mt-2 px-6 py-3 bg-black text-white rounded-xl font-bold text-sm hover:bg-neutral-800 transition-colors"
          >
            Aller aux leads
          </button>
        {/if}
      </div>
    {:else}
      <div class="divide-y divide-neutral-100">
        {#each filteredLeads as lead (lead.leadId)}
          {@const statusConfig = getEmailStatusConfig(lead.lastEmailStatus, lead.needsFollowUp)}
          {@const isExpanded = expandedLeadId === lead.leadId}
          <div in:fade={{ duration: 150 }}>
            <button
              onclick={() => togglePanel(lead)}
              class="w-full px-6 py-4 flex items-center gap-4 hover:bg-white/60 transition-colors text-left {isExpanded ? 'bg-white' : ''} {lead.needsFollowUp ? 'border-l-4 border-amber-400' : 'border-l-4 border-transparent'}"
            >
              <div
                class="w-10 h-10 rounded-xl border border-neutral-200 bg-white flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm"
              >
                <img
                  src={getFaviconUrl(getFaviconSource(lead), 64)}
                  alt="favicon"
                  class="w-6 h-6"
                  loading="lazy"
                  onerror={(e) => handleFaviconError(e.currentTarget)}
                />
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-black text-sm text-neutral-900 truncate">{getLeadName(lead)}</span>
                  <span class="px-2 py-0.5 rounded-md text-[10px] font-black uppercase {getLeadStatusColor(lead.status)}">
                    {lead.status}
                  </span>
                </div>
                {#if getLeadSubtitle(lead)}
                  <p class="text-xs text-neutral-500 font-medium mt-0.5 truncate">{getLeadSubtitle(lead)}</p>
                {/if}
              </div>

              <div class="hidden md:block flex-1 min-w-0 px-4">
                <p class="text-xs text-neutral-600 font-medium truncate">{lead.lastEmailSubject}</p>
                <p class="text-[10px] text-neutral-400 mt-0.5">{lead.emailsSentCount} e-mail{lead.emailsSentCount !== 1 ? 's' : ''} envoyé{lead.emailsSentCount !== 1 ? 's' : ''}</p>
              </div>

              <div class="flex items-center gap-3 flex-shrink-0">
                <span class="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border {statusConfig.cls}">
                  {statusConfig.label}
                </span>

                <div class="hidden sm:flex items-center gap-1.5 {lead.needsFollowUp ? 'text-amber-600' : 'text-neutral-400'}">
                  <iconify-icon
                    icon={lead.needsFollowUp ? 'solar:bell-bing-bold' : 'solar:calendar-bold'}
                    width="14"
                  ></iconify-icon>
                  <span class="text-xs font-bold">{formatDays(lead.daysSinceLastContact)}</span>
                </div>

                <div class="hidden lg:flex items-center gap-2">
                  <div class="w-12 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                    <div
                      class="h-full {lead.score >= 70 ? 'bg-green-500' : lead.score >= 40 ? 'bg-yellow-500' : 'bg-orange-400'}"
                      style="width: {Math.min(lead.score, 100)}%"
                    ></div>
                  </div>
                  <span class="text-xs font-bold text-neutral-500">{lead.score}</span>
                </div>

                <iconify-icon
                  icon={isExpanded ? 'solar:alt-arrow-up-bold' : 'solar:alt-arrow-down-bold'}
                  width="16"
                  class="text-neutral-400 flex-shrink-0"
                ></iconify-icon>
              </div>
            </button>

            {#if isExpanded}
              <div
                class="border-t border-neutral-200/60 bg-white"
                transition:slide={{ duration: 200 }}
              >
                {#if panelLoading}
                  <div class="flex items-center justify-center py-12">
                    <Spinner size="md" color="neutral" />
                  </div>
                {:else}
                  <div class="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-neutral-100">
                    <div class="p-6 space-y-3">
                      <div class="flex items-center justify-between mb-4">
                        <h3 class="text-[9px] font-black uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                          <iconify-icon icon="solar:history-bold" width="14"></iconify-icon>
                          Historique des e-mails
                        </h3>
                        <button
                          onclick={(e) => { e.stopPropagation(); goto(`/app/leads/${lead.leadId}`); }}
                          class="text-[10px] font-bold text-neutral-500 hover:text-black transition-colors flex items-center gap-1"
                        >
                          Profil complet
                          <iconify-icon icon="solar:arrow-right-up-bold" width="12"></iconify-icon>
                        </button>
                      </div>

                      {#if panelHistory.length === 0}
                        <div class="py-6 text-center">
                          <p class="text-xs font-bold text-neutral-400">Aucun e-mail envoyé</p>
                        </div>
                      {:else}
                        <div class="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {#each panelHistory as email}
                            <button
                              onclick={(e) => { e.stopPropagation(); expandedEmailId = expandedEmailId === email.id ? null : email.id; }}
                              class="w-full text-left"
                            >
                              <div class="flex items-start gap-3 p-3 rounded-xl hover:bg-neutral-50 transition-colors">
                                <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 {getHistoryStatusColor(email.status)}">
                                  <iconify-icon icon={getHistoryStatusIcon(email.status)} width="14"></iconify-icon>
                                </div>
                                <div class="flex-1 min-w-0">
                                  <p class="text-xs font-bold text-neutral-800 truncate">{email.subject}</p>
                                  <p class="text-[10px] text-neutral-400 mt-0.5">{formatDate(email.sentAt || email.createdAt)}</p>
                                  {#if expandedEmailId === email.id && email.textBody}
                                    <p class="text-xs text-neutral-600 mt-2 leading-relaxed whitespace-pre-wrap border-t border-neutral-100 pt-2" in:slide={{ duration: 150 }}>
                                      {email.textBody}
                                    </p>
                                  {/if}
                                  {#if email.error}
                                    <p class="text-[10px] text-red-500 mt-1">{email.error}</p>
                                  {/if}
                                </div>
                                <iconify-icon
                                  icon={expandedEmailId === email.id ? 'solar:alt-arrow-up-bold' : 'solar:alt-arrow-down-bold'}
                                  width="12"
                                  class="text-neutral-300 flex-shrink-0 mt-1"
                                ></iconify-icon>
                              </div>
                            </button>
                          {/each}
                        </div>
                      {/if}
                    </div>

                    <div class="p-6 space-y-4" onclick={(e) => e.stopPropagation()}>
                      <h3 class="text-[9px] font-black uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                        <iconify-icon icon="solar:rocket-2-bold" width="14"></iconify-icon>
                        {lead.emailsSentCount > 0 ? 'Envoyer une relance' : 'Envoyer un e-mail'}
                      </h3>

                      {#if !lead.email}
                        <div class="py-6 text-center rounded-xl border-2 border-dashed border-neutral-200">
                          <p class="text-xs font-bold text-neutral-400">Aucune adresse e-mail</p>
                        </div>
                      {:else if templates.length === 0}
                        <div class="py-6 text-center rounded-xl border-2 border-dashed border-neutral-200">
                          <p class="text-xs font-bold text-neutral-400">Aucun modèle disponible</p>
                        </div>
                      {:else}
                        <div class="space-y-3">
                          <div>
                            <label class="block text-[9px] font-black uppercase tracking-widest text-neutral-500 mb-1.5">
                              Modèle
                            </label>
                            <select
                              bind:value={selectedTemplate}
                              onchange={() => handleTemplateChange(lead)}
                              class="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl font-semibold text-sm outline-none focus:border-black transition"
                            >
                              {#each templates as template}
                                <option value={template.id}>{template.name}</option>
                              {/each}
                            </select>
                          </div>

                          {#if selectedTemplate}
                            {@const tpl = templates.find((t) => t.id === selectedTemplate)}
                            {#if tpl && tpl.variables.length > 0}
                              <div class="space-y-2">
                                <p class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Variables</p>

                                {#each tpl.variables as variable}
                                  <div>
                                    <label class="block text-[10px] font-bold text-neutral-500 mb-1 capitalize">
                                      {variable.replace(/([A-Z])/g, ' $1').trim()}
                                    </label>
                                    <input
                                      type="text"
                                      bind:value={composeVariables[variable]}
                                      placeholder={variable.replace(/([A-Z])/g, ' $1').trim().toLowerCase()}
                                      class="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium outline-none focus:border-black transition placeholder:text-neutral-300"
                                    />
                                  </div>
                                {/each}
                              </div>
                            {/if}
                          {/if}

                          <div class="pt-1">
                            <p class="text-[10px] text-neutral-400 font-medium mb-3">
                              Envoi à <span class="font-black text-neutral-700">{lead.email}</span>
                            </p>
                            <button
                              onclick={() => sendFromPanel(lead)}
                              disabled={sending || !selectedTemplate}
                              class="w-full bg-black text-white px-4 py-3 rounded-xl font-bold text-sm hover:bg-neutral-800 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                              {#if sending}
                                <Spinner size="sm" color="white" />
                                Envoi...
                              {:else}
                                <iconify-icon icon="solar:rocket-2-bold" width="16"></iconify-icon>
                                {lead.emailsSentCount > 0 ? 'Envoyer une relance' : 'Envoyer un e-mail'}
                              {/if}
                            </button>
                          </div>
                        </div>
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>
