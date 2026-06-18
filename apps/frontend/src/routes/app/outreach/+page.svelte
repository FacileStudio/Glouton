<script lang="ts">
  import { fade, slide } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { goto, replaceState } from '$app/navigation';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import { Spinner, Skeleton } from '@repo/ui';
  import { getFaviconUrl, handleFaviconError } from '$lib/utils/favicon';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import 'iconify-icon';

  let teamId = $derived(teamContextStore.getTeamId());
  let settingsUrl = $derived(teamId ? `/app/teams/${teamId}/settings` : '/app/settings');

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

  let outreachLeads = $state<OutreachLead[]>([]);
  let stats = $state<Stats | null>(null);
  let templates = $state<EmailTemplate[]>([]);
  let initialLoading = $state(true);
  let activeTab = $state<'all' | 'followup' | 'pending' | 'replied'>('all');
  let search = $state('');
  let mounted = $state(false);

  function syncToUrl() {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (activeTab !== 'all') params.set('tab', activeTab);
    const qs = params.toString();
    replaceState(qs ? `?${qs}` : location.pathname, {});
  }

  $effect(() => {
    if (mounted) {
      search;
      activeTab;
      syncToUrl();
    }
  });

  let expandedLeadId = $state<string | null>(null);
  let panelHistory = $state<EmailHistory[]>([]);
  let panelLoading = $state(false);
  let expandedEmailId = $state<string | null>(null);

  let selectedTemplate = $state('');
  let composeVariables = $state<Record<string, string>>({});
  let sending = $state(false);
  let smtpConfigured = $state<boolean>(true);
  let checkingSmtp = $state(true);

  onMount(async () => {
    const params = new URLSearchParams(location.search);
    search = params.get('search') || '';
    const tab = params.get('tab');
    if (tab === 'followup' || tab === 'pending' || tab === 'replied') activeTab = tab;

    await Promise.all([loadData(), checkSmtpConfiguration()]);
    mounted = true;
  });

  async function loadData() {
    initialLoading = true;
    try {
      const [outreachData, statsData, templatesData] = await Promise.all([
        trpc.email.getAllOutreach.query({ teamId }),
        trpc.email.getStats.query({ teamId }),
        trpc.email.getTemplates.query(),
      ]);
      outreachLeads = outreachData as OutreachLead[];
      stats = statsData as Stats;
      templates = templatesData;
    } catch (error) {
      console.error('[OUTREACH] Error loading data:', error);
      toast.push('Échec du chargement des données de prospection', 'error');

      outreachLeads = [];
      stats = null;
      templates = [];
    } finally {
      initialLoading = false;
    }
  }

  async function checkSmtpConfiguration() {
    checkingSmtp = true;
    try {
      const status = await trpc.email.getSmtpStatus.query({ teamId });
      smtpConfigured = status.configured;
    } catch (error) {
      console.error('[OUTREACH] Error checking SMTP config:', error);
      smtpConfigured = false;
    } finally {
      checkingSmtp = false;
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
      panelHistory = (await trpc.email.getLeadOutreach.query({ leadId: lead.leadId, teamId })) as EmailHistory[];
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
        teamId,
        leadId: lead.leadId,
        templateId: selectedTemplate,
        variables: composeVariables,
      });
      toast.push('E-mail envoyé avec succès !', 'success');
      panelHistory = (await trpc.email.getLeadOutreach.query({ leadId: lead.leadId, teamId })) as EmailHistory[];
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
    if (needsFollowUp) return { label: 'À relancer', cls: 'bg-muted text-foreground' };
    switch (status) {
      case 'REPLIED': return { label: 'Répondu', cls: 'bg-muted text-foreground' };
      case 'OPENED': return { label: 'Ouvert', cls: 'bg-muted text-foreground' };
      case 'CLICKED': return { label: 'Cliqué', cls: 'bg-muted text-foreground' };
      case 'SENT': return { label: 'Envoyé', cls: 'bg-muted text-foreground' };
      case 'FAILED': return { label: 'Échoué', cls: 'bg-destructive/10 text-destructive' };
      case 'BOUNCED': return { label: 'Rejeté', cls: 'bg-destructive/10 text-destructive' };
      default: return { label: status, cls: 'bg-muted text-foreground' };
    }
  }

  function getLeadStatusColor(_status: string): string {
    return 'bg-muted text-foreground';
  }

  function getHistoryStatusIcon(status: string): string {
    switch (status) {
      case 'REPLIED': return 'solar:reply-linear';
      case 'OPENED': return 'solar:eye-linear';
      case 'CLICKED': return 'solar:cursor-linear';
      case 'SENT': return 'solar:letter-linear';
      case 'FAILED': case 'BOUNCED': return 'solar:danger-triangle-linear';
      default: return 'solar:clock-circle-linear';
    }
  }

  function getHistoryStatusColor(status: string): string {
    switch (status) {
      case 'FAILED': case 'BOUNCED': return 'bg-destructive/10 text-destructive';
      default: return 'bg-muted text-foreground';
    }
  }

  let followUpLeads = $derived(outreachLeads.filter((l) => l.needsFollowUp));
  let pendingLeads = $derived(outreachLeads.filter(
    (l) => !l.needsFollowUp && (l.lastEmailStatus === 'SENT' || l.lastEmailStatus === 'OPENED'),
  ));
  let repliedLeads = $derived(outreachLeads.filter((l) => l.lastEmailStatus === 'REPLIED'));
  let tabLeads = $derived(
    activeTab === 'all'
      ? outreachLeads
      : activeTab === 'followup'
        ? followUpLeads
        : activeTab === 'pending'
          ? pendingLeads
          : repliedLeads
  );
  let filteredLeads = $derived(search
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
    : tabLeads);

  let expandedLead = $derived(outreachLeads.find((l) => l.leadId === expandedLeadId) ?? null);
</script>

<div class="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
  <div class="space-y-1">
    <h1 class="text-2xl font-bold tracking-tight text-foreground">Prospection</h1>
    <p class="text-sm text-muted-foreground">Historique des e-mails, relances et réponses</p>
  </div>

  {#if !checkingSmtp && !smtpConfigured}
    <div class="rounded-xl border border-border bg-card p-4 flex items-start gap-3" transition:slide={{ duration: 200 }}>
      <iconify-icon icon="solar:danger-triangle-linear" width="20" class="text-muted-foreground shrink-0 mt-0.5"></iconify-icon>
      <div class="flex-1 space-y-1">
        <h3 class="text-sm font-semibold text-foreground">Configuration SMTP manquante</h3>
        <p class="text-sm text-muted-foreground">
          Vous devez configurer vos paramètres SMTP pour pouvoir envoyer des e-mails. Rendez-vous dans les paramètres de l'espace pour ajouter votre configuration SMTP.
        </p>
        <div class="pt-2">
          <button
            onclick={() => goto(settingsUrl)}
            class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
          >
            <iconify-icon icon="solar:settings-linear" width="16"></iconify-icon>
            Configurer SMTP
          </button>
        </div>
      </div>
    </div>
  {/if}

  <section class="grid grid-cols-1 sm:grid-cols-3 gap-4">
    {#if initialLoading}
      {#each Array(3) as _}
        <div class="rounded-xl border border-border bg-card p-4">
          <div class="flex items-start justify-between mb-3">
            <Skeleton width="120px" height="1rem" rounded="md" />
            <Skeleton width="20px" height="20px" rounded="md" />
          </div>
          <Skeleton width="80px" height="1.5rem" rounded="md" />
        </div>
      {/each}
    {:else}
      {#each [
        {
          label: 'Envoyés',
          val: (stats?.totalEmails ?? 0).toString(),
          icon: 'solar:letter-linear',
        },
        {
          label: 'Contactés',
          val: (stats?.contactedLeads ?? 0).toString(),
          icon: 'solar:users-group-rounded-linear',
        },
        {
          label: 'À relancer',
          val: (stats?.needsFollowUp ?? 0).toString(),
          icon: 'solar:bell-bing-linear',
        },
      ] as stat}
        <div class="rounded-xl border border-border bg-card p-4">
          <div class="flex items-start justify-between mb-3">
            <h3 class="text-sm text-muted-foreground">{stat.label}</h3>
            <iconify-icon icon={stat.icon} class="text-muted-foreground" width="18"></iconify-icon>
          </div>
          <p class="text-2xl font-bold tracking-tight text-foreground">{stat.val}</p>
        </div>
      {/each}
    {/if}
  </section>

  <div class="rounded-xl border border-border bg-card p-4 space-y-3">
    <div class="relative">
      <iconify-icon
        icon="solar:magnifer-linear"
        width="16"
        class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
      ></iconify-icon>
      <input
        type="text"
        bind:value={search}
        placeholder="Rechercher par nom, e-mail, domaine..."
        class="w-full h-9 rounded-lg border border-input bg-background pl-9 pr-9 text-sm"
      />
      {#if search}
        <button
          onclick={() => (search = '')}
          aria-label="Effacer la recherche"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <iconify-icon icon="solar:close-circle-linear" width="16"></iconify-icon>
        </button>
      {/if}
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap items-center gap-1">
        {#each [
          { key: 'all', label: 'Tous', count: outreachLeads.length },
          { key: 'followup', label: 'À relancer', count: followUpLeads.length },
          { key: 'pending', label: 'En attente', count: pendingLeads.length },
          { key: 'replied', label: 'Répondu', count: repliedLeads.length },
        ] as tab}
          <button
            onclick={() => { activeTab = tab.key as typeof activeTab; expandedLeadId = null; }}
            class="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors {activeTab === tab.key
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
          >
            {tab.label}
            <span class="rounded-full bg-muted text-foreground px-2 py-0.5 text-xs font-medium {activeTab === tab.key ? 'bg-background' : ''}">
              {tab.count}
            </span>
          </button>
        {/each}
      </div>
      <p class="text-xs text-muted-foreground">Seuil de relance : 5 jours</p>
    </div>
  </div>

  <section class="rounded-xl border border-border bg-card overflow-hidden">

    {#if initialLoading}
      <div class="p-4 space-y-2">
        {#each Array(5) as _}
          <div class="flex items-center gap-3 p-3 rounded-lg">
            <Skeleton width="36px" height="36px" rounded="lg" />
            <div class="flex-1 space-y-2">
              <Skeleton width="200px" height="0.875rem" rounded="md" />
              <Skeleton width="140px" height="0.75rem" rounded="md" />
            </div>
            <Skeleton width="80px" height="1.25rem" rounded="md" />
          </div>
        {/each}
      </div>
    {:else if filteredLeads.length === 0}
      <div class="flex flex-col items-center justify-center py-16 space-y-3">
        <iconify-icon icon="solar:inbox-line-linear" width="48" class="text-muted-foreground"></iconify-icon>
        <p class="text-sm text-muted-foreground">
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
            class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
          >
            Aller aux leads
          </button>
        {/if}
      </div>
    {:else}
      <div class="divide-y divide-border">
        {#each filteredLeads as lead (lead.leadId)}
          {@const statusConfig = getEmailStatusConfig(lead.lastEmailStatus, lead.needsFollowUp)}
          {@const isExpanded = expandedLeadId === lead.leadId}
          <div in:fade={{ duration: 150 }}>
            <button
              onclick={() => togglePanel(lead)}
              class="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left {isExpanded ? 'bg-muted/30' : ''}"
            >
              <div class="size-9 rounded-lg border border-border bg-background flex items-center justify-center overflow-hidden shrink-0">
                <img
                  src={getFaviconUrl(getFaviconSource(lead), 64)}
                  alt="favicon"
                  class="w-5 h-5"
                  loading="lazy"
                  onerror={(e) => handleFaviconError(e.currentTarget)}
                />
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-medium text-foreground truncate">{getLeadName(lead)}</span>
                  <span class="rounded-full px-2.5 py-0.5 text-xs font-medium {getLeadStatusColor(lead.status)}">
                    {lead.status}
                  </span>
                </div>
                {#if getLeadSubtitle(lead)}
                  <p class="text-xs text-muted-foreground mt-0.5 truncate">{getLeadSubtitle(lead)}</p>
                {/if}
              </div>

              <div class="hidden md:block flex-1 min-w-0 px-4">
                <p class="text-sm text-foreground truncate">{lead.lastEmailSubject}</p>
                <p class="text-xs text-muted-foreground mt-0.5">{lead.emailsSentCount} e-mail{lead.emailsSentCount !== 1 ? 's' : ''} envoyé{lead.emailsSentCount !== 1 ? 's' : ''}</p>
              </div>

              <div class="flex items-center gap-3 shrink-0">
                <span class="rounded-full px-2.5 py-0.5 text-xs font-medium {statusConfig.cls}">
                  {statusConfig.label}
                </span>

                <div class="hidden sm:flex items-center gap-1.5 text-muted-foreground">
                  <iconify-icon
                    icon={lead.needsFollowUp ? 'solar:bell-bing-linear' : 'solar:calendar-linear'}
                    width="14"
                  ></iconify-icon>
                  <span class="text-xs">{formatDays(lead.daysSinceLastContact)}</span>
                </div>

                <div class="hidden lg:flex items-center gap-2">
                  <div class="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      class="h-full bg-foreground"
                      style="width: {Math.min(lead.score, 100)}%"
                    ></div>
                  </div>
                  <span class="text-xs text-muted-foreground">{lead.score}</span>
                </div>

                <iconify-icon
                  icon={isExpanded ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
                  width="14"
                  class="text-muted-foreground shrink-0"
                ></iconify-icon>
              </div>
            </button>

            {#if isExpanded}
              <div
                class="border-t border-border bg-background"
                transition:slide={{ duration: 200 }}
              >
                {#if panelLoading}
                  <div class="flex items-center justify-center py-12">
                    <Spinner size="md" color="neutral" />
                  </div>
                {:else}
                  <div class="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
                    <div class="p-6 space-y-3">
                      <div class="flex items-center justify-between mb-3">
                        <h3 class="text-sm font-semibold text-foreground flex items-center gap-2">
                          <iconify-icon icon="solar:history-linear" width="16"></iconify-icon>
                          Historique des e-mails
                        </h3>
                        <button
                          onclick={(e) => { e.stopPropagation(); goto(`/app/leads/${lead.leadId}`); }}
                          class="inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        >
                          Profil complet
                          <iconify-icon icon="solar:arrow-right-up-linear" width="14"></iconify-icon>
                        </button>
                      </div>

                      {#if panelHistory.length === 0}
                        <div class="py-6 text-center">
                          <p class="text-sm text-muted-foreground">Aucun e-mail envoyé</p>
                        </div>
                      {:else}
                        <div class="space-y-1 max-h-64 overflow-y-auto pr-1">
                          {#each panelHistory as email}
                            <button
                              onclick={(e) => { e.stopPropagation(); expandedEmailId = expandedEmailId === email.id ? null : email.id; }}
                              class="w-full text-left"
                            >
                              <div class="flex items-start gap-3 p-3 rounded-lg hover:bg-muted transition-colors">
                                <div class="size-7 rounded-lg flex items-center justify-center shrink-0 {getHistoryStatusColor(email.status)}">
                                  <iconify-icon icon={getHistoryStatusIcon(email.status)} width="14"></iconify-icon>
                                </div>
                                <div class="flex-1 min-w-0">
                                  <p class="text-sm font-medium text-foreground truncate">{email.subject}</p>
                                  <p class="text-xs text-muted-foreground mt-0.5">{formatDate(email.sentAt || email.createdAt)}</p>
                                  {#if expandedEmailId === email.id && email.textBody}
                                    <p class="text-sm text-foreground mt-2 leading-relaxed whitespace-pre-wrap border-t border-border pt-2" in:slide={{ duration: 150 }}>
                                      {email.textBody}
                                    </p>
                                  {/if}
                                  {#if email.error}
                                    <p class="text-xs text-destructive mt-1">{email.error}</p>
                                  {/if}
                                </div>
                                <iconify-icon
                                  icon={expandedEmailId === email.id ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
                                  width="12"
                                  class="text-muted-foreground shrink-0 mt-1"
                                ></iconify-icon>
                              </div>
                            </button>
                          {/each}
                        </div>
                      {/if}
                    </div>

                    <div class="p-6 space-y-4" role="presentation" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
                      <h3 class="text-sm font-semibold text-foreground flex items-center gap-2">
                        <iconify-icon icon="solar:rocket-2-linear" width="16"></iconify-icon>
                        {lead.emailsSentCount > 0 ? 'Envoyer une relance' : 'Envoyer un e-mail'}
                      </h3>

                      {#if !lead.email}
                        <div class="py-6 text-center rounded-lg border border-dashed border-border">
                          <p class="text-sm text-muted-foreground">Aucune adresse e-mail</p>
                        </div>
                      {:else if templates.length === 0}
                        <div class="py-6 text-center rounded-lg border border-dashed border-border">
                          <p class="text-sm text-muted-foreground">Aucun modèle disponible</p>
                        </div>
                      {:else}
                        {#if !smtpConfigured}
                          <div class="rounded-lg border border-border bg-muted/50 p-3 flex items-start gap-2">
                            <iconify-icon icon="solar:danger-triangle-linear" width="16" class="text-muted-foreground shrink-0 mt-0.5"></iconify-icon>
                            <div class="flex-1">
                              <p class="text-sm font-medium text-foreground">SMTP non configuré</p>
                              <p class="text-xs text-muted-foreground mt-0.5">
                                Configurez vos paramètres SMTP dans les paramètres de l'espace pour envoyer des e-mails.
                              </p>
                            </div>
                          </div>
                        {/if}

                        <div class="space-y-3">
                          <div class="space-y-1.5">
                            <label for="template-select-{lead.id}" class="block text-sm font-medium text-foreground">
                              Modèle
                            </label>
                            <select
                              id="template-select-{lead.id}"
                              bind:value={selectedTemplate}
                              onchange={() => handleTemplateChange(lead)}
                              class="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
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
                                <p class="text-sm font-medium text-foreground">Variables</p>

                                {#each tpl.variables as variable}
                                  <div class="space-y-1.5">
                                    <label for="var-{lead.id}-{variable}" class="block text-xs text-muted-foreground capitalize">
                                      {variable.replace(/([A-Z])/g, ' $1').trim()}
                                    </label>
                                    <input
                                      id="var-{lead.id}-{variable}"
                                      type="text"
                                      bind:value={composeVariables[variable]}
                                      placeholder={variable.replace(/([A-Z])/g, ' $1').trim().toLowerCase()}
                                      class="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
                                    />
                                  </div>
                                {/each}
                              </div>
                            {/if}
                          {/if}

                          <div class="pt-1">
                            <p class="text-xs text-muted-foreground mb-3">
                              Envoi à <span class="text-foreground font-medium">{lead.email}</span>
                            </p>
                            <button
                              onclick={() => sendFromPanel(lead)}
                              disabled={sending || !selectedTemplate || !smtpConfigured}
                              class="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {#if sending}
                                <Spinner size="sm" color="white" />
                                Envoi...
                              {:else}
                                <iconify-icon icon="solar:rocket-2-linear" width="16"></iconify-icon>
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
