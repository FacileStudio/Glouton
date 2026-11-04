<script lang="ts">
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import { fade, slide } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { trpc } from '$lib/trpc';
  import {
    toast,
    Badge,
    Button,
    Card,
    EmptyState,
    Icon,
    IconButton,
    Input,
    PageHeader,
    Skeleton,
    Spinner,
    StatCard,
    Tabs,
    icons,
  } from '@facile/muse';
  import type { BadgeProps } from '@facile/muse';
  import { getFaviconUrl, handleFaviconError } from '$lib/utils/favicon';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import Composer, { type ComposerMessage } from '$lib/components/mail/Composer.svelte';

  let teamId = $derived(teamContextStore.getTeamId());

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
  let initialLoading = $state(true);
  let activeTab = $state<'all' | 'followup' | 'pending' | 'replied'>('all');
  let search = $state('');
  let mounted = $state(false);

  function syncToUrl() {
    const params = new SvelteURLSearchParams();
    if (search) params.set('search', search);
    if (activeTab !== 'all') params.set('tab', activeTab);
    const qs = params.toString();
    replaceState(qs ? resolve(`/app/outreach?${qs}`) : resolve('/app/outreach'), {});
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

  let composing = $state<OutreachLead | null>(null);
  let composerOpen = $state(false);

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
      const [outreachData, statsData] = await Promise.all([
        trpc.email.getAllOutreach.query({ teamId }),
        trpc.email.getStats.query({ teamId }),
      ]);
      outreachLeads = outreachData as OutreachLead[];
      stats = statsData as Stats;
    } catch (error) {
      console.error('[OUTREACH] Error loading data:', error);
      toast.danger('Échec du chargement des données de prospection');

      outreachLeads = [];
      stats = null;
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
    panelLoading = true;
    try {
      await loadHistory(lead.leadId);
    } catch {
      toast.danger("Échec du chargement de l'historique");
    } finally {
      panelLoading = false;
    }
  }

  async function loadHistory(leadId: string) {
    panelHistory = (await trpc.email.getLeadOutreach.query({ leadId, teamId })) as EmailHistory[];
  }

  function compose(lead: OutreachLead) {
    composing = lead;
    composerOpen = true;
  }

  async function sendToLead(message: ComposerMessage) {
    await trpc.email.sendToLead.mutate({ teamId, leadId: message.recipientId, subject: message.subject, text: message.text });
  }

  async function sent() {
    if (expandedLeadId) await loadHistory(expandedLeadId);
    await loadData();
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

  type Tone = NonNullable<BadgeProps['tone']>;

  function getEmailStatusConfig(status: string, needsFollowUp: boolean): { label: string; tone: Tone } {
    if (needsFollowUp) return { label: 'À relancer', tone: 'neutral' };
    switch (status) {
      case 'REPLIED': return { label: 'Répondu', tone: 'neutral' };
      case 'OPENED': return { label: 'Ouvert', tone: 'neutral' };
      case 'CLICKED': return { label: 'Cliqué', tone: 'neutral' };
      case 'SENT': return { label: 'Envoyé', tone: 'neutral' };
      case 'FAILED': return { label: 'Échoué', tone: 'danger' };
      case 'BOUNCED': return { label: 'Rejeté', tone: 'danger' };
      default: return { label: status, tone: 'neutral' };
    }
  }

  function getHistoryStatusIcon(status: string): string {
    switch (status) {
      case 'REPLIED': return 'solar:reply-linear';
      case 'OPENED': return icons.eye;
      case 'CLICKED': return 'solar:cursor-linear';
      case 'SENT': return icons.mail;
      case 'FAILED': case 'BOUNCED': return icons.warning;
      default: return icons.clock;
    }
  }

  function getHistoryStatusColor(status: string): string {
    switch (status) {
      case 'FAILED': case 'BOUNCED': return 'bg-fc-danger/10 text-fc-danger';
      default: return 'bg-fc-surface text-fc-fg';
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


  let tabItems = $derived([
    { id: 'all', label: 'Tous', badge: outreachLeads.length },
    { id: 'followup', label: 'À relancer', badge: followUpLeads.length },
    { id: 'pending', label: 'En attente', badge: pendingLeads.length },
    { id: 'replied', label: 'Répondu', badge: repliedLeads.length },
  ]);

  let stat = $derived([
    { label: 'Envoyés', val: (stats?.totalEmails ?? 0).toString() },
    { label: 'Contactés', val: (stats?.contactedLeads ?? 0).toString() },
    { label: 'À relancer', val: (stats?.needsFollowUp ?? 0).toString() },
  ]);
</script>

<div class="flex flex-col gap-6">
  <PageHeader title="Prospection" description="Historique des e-mails, relances et réponses" />

  <section class="grid grid-cols-1 gap-4 sm:grid-cols-3">
    {#if initialLoading}
      {#each Array(3) as _, i (i)}
        <Card class="flex flex-col gap-2">
          <Skeleton class="h-3 w-[120px]" />
          <Skeleton class="h-7 w-[80px]" />
        </Card>
      {/each}
    {:else}
      {#each stat as item (item.label)}
        <StatCard label={item.label} value={item.val} />
      {/each}
    {/if}
  </section>

  <Card class="flex flex-col gap-3 p-4">
    <div class="relative">
      <Icon
        icon={icons.search}
        size={16}
        class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fc-fg-muted"
      />
      <Input
        type="text"
        bind:value={search}
        placeholder="Rechercher par nom, e-mail, domaine..."
        aria-label="Rechercher"
        class="pl-9 pr-11"
      />
      {#if search}
        <IconButton
          variant="ghost"
          aria-label="Effacer la recherche"
          onclick={() => (search = '')}
          class="absolute right-0 top-0"
        >
          <Icon icon={icons.close} />
        </IconButton>
      {/if}
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <Tabs
        items={tabItems}
        value={activeTab}
        label="Filtrer les contacts"
        onChange={(id) => { activeTab = id as typeof activeTab; expandedLeadId = null; }}
        class="w-auto min-w-0 flex-1"
      />
      <p class="text-fc-xs text-fc-fg-muted">Seuil de relance : 5 jours</p>
    </div>
  </Card>

  {#if initialLoading}
    <Card class="flex flex-col gap-2 p-4">
      {#each Array(5) as _, i (i)}
        <div class="flex items-center gap-3 p-3">
          <Skeleton class="size-9 rounded-fc-md" />
          <div class="flex flex-1 flex-col gap-2">
            <Skeleton class="h-3.5 w-[200px] max-w-full" />
            <Skeleton class="h-3 w-[140px] max-w-full" />
          </div>
          <Skeleton class="h-5 w-[80px]" />
        </div>
      {/each}
    </Card>
  {:else if filteredLeads.length === 0}
    <EmptyState
      icon="solar:inbox-line-linear"
      title={activeTab === 'all'
        ? 'Aucun e-mail envoyé'
        : activeTab === 'followup'
          ? 'Aucune relance nécessaire'
          : activeTab === 'pending'
            ? 'Aucun contact en attente'
            : 'Aucune réponse'}
    >
      {#if activeTab === 'all'}
        <Button href="/app/leads">Aller aux leads</Button>
      {/if}
    </EmptyState>
  {:else}
    <Card class="overflow-hidden p-0">
      <div class="divide-y divide-fc-border">
        {#each filteredLeads as lead (lead.leadId)}
          {@const statusConfig = getEmailStatusConfig(lead.lastEmailStatus, lead.needsFollowUp)}
          {@const isExpanded = expandedLeadId === lead.leadId}
          <div in:fade={{ duration: 150 }}>
            <button
              type="button"
              onclick={() => togglePanel(lead)}
              aria-expanded={isExpanded}
              class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-fc-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fc-ring {isExpanded ? 'bg-fc-surface' : ''}"
            >
              <div class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-fc-md bg-fc-bg">
                <img
                  src={getFaviconUrl(getFaviconSource(lead), 64)}
                  alt="favicon"
                  class="h-5 w-5"
                  loading="lazy"
                  onerror={(e) => handleFaviconError(e.currentTarget)}
                />
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="truncate text-fc-sm font-medium text-fc-fg">{getLeadName(lead)}</span>
                  <Badge>{lead.status}</Badge>
                </div>
                {#if getLeadSubtitle(lead)}
                  <p class="mt-0.5 truncate text-fc-xs text-fc-fg-muted">{getLeadSubtitle(lead)}</p>
                {/if}
              </div>

              <div class="hidden min-w-0 flex-1 px-4 md:block">
                <p class="truncate text-fc-sm text-fc-fg">{lead.lastEmailSubject}</p>
                <p class="mt-0.5 text-fc-xs text-fc-fg-muted">{lead.emailsSentCount} e-mail{lead.emailsSentCount !== 1 ? 's' : ''} envoyé{lead.emailsSentCount !== 1 ? 's' : ''}</p>
              </div>

              <div class="flex shrink-0 items-center gap-3">
                <Badge tone={statusConfig.tone}>{statusConfig.label}</Badge>

                <div class="hidden items-center gap-1.5 text-fc-fg-muted sm:flex">
                  <Icon icon={lead.needsFollowUp ? 'solar:bell-bing-linear' : icons.calendar} size={14} />
                  <span class="text-fc-xs">{formatDays(lead.daysSinceLastContact)}</span>
                </div>

                <div class="hidden items-center gap-2 lg:flex">
                  <div class="h-1.5 w-12 overflow-hidden rounded-fc-pill bg-fc-surface">
                    <div
                      class="h-full bg-fc-fg"
                      style="width: {Math.min(lead.score, 100)}%"
                    ></div>
                  </div>
                  <span class="text-fc-xs text-fc-fg-muted">{lead.score}</span>
                </div>

                <Icon
                  icon={isExpanded ? icons.chevronUp : icons.chevronDown}
                  size={16}
                  class="text-fc-fg-muted"
                />
              </div>
            </button>

            {#if isExpanded}
              <div
                class="border-t border-fc-border bg-fc-bg"
                transition:slide={{ duration: 200 }}
              >
                {#if panelLoading}
                  <div class="flex items-center justify-center py-12">
                    <Spinner size="md" label="Chargement" />
                  </div>
                {:else}
                  <div class="flex flex-col gap-3 p-4 sm:p-6">
                    <div class="flex items-center justify-between gap-2">
                      <h3 class="flex items-center gap-2 text-fc-sm font-semibold text-fc-fg">
                        <Icon icon={icons.history} size={16} />
                        Historique des e-mails
                      </h3>
                      <div class="flex flex-wrap gap-2">
                        <Button href={`/app/leads/${lead.leadId}`} variant="ghost" size="sm" iconRight="solar:arrow-right-up-linear">
                          Profil complet
                        </Button>
                        {#if lead.email}
                          <Button size="sm" icon="solar:letter-linear" onclick={() => compose(lead)}>
                            {lead.emailsSentCount > 0 ? 'Envoyer une relance' : 'Envoyer un e-mail'}
                          </Button>
                        {/if}
                      </div>
                    </div>

                    {#if panelHistory.length === 0}
                      <p class="py-6 text-center text-fc-sm text-fc-fg-muted">Aucun e-mail envoyé</p>
                    {:else}
                      <div class="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
                        {#each panelHistory as email (email.id)}
                          <button
                            type="button"
                            onclick={(e) => { e.stopPropagation(); expandedEmailId = expandedEmailId === email.id ? null : email.id; }}
                            aria-expanded={expandedEmailId === email.id}
                            class="flex w-full items-start gap-3 rounded-fc-md p-3 text-left transition-colors hover:bg-fc-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring"
                          >
                            <div class="flex size-7 shrink-0 items-center justify-center rounded-fc-md {getHistoryStatusColor(email.status)}">
                              <Icon icon={getHistoryStatusIcon(email.status)} size={14} />
                            </div>
                            <div class="min-w-0 flex-1">
                              <p class="truncate text-fc-sm font-medium text-fc-fg">{email.subject}</p>
                              <p class="mt-0.5 text-fc-xs text-fc-fg-muted">{formatDate(email.sentAt || email.createdAt)}</p>
                              {#if expandedEmailId === email.id && email.textBody}
                                <p class="mt-2 whitespace-pre-wrap border-t border-fc-border pt-2 text-fc-sm leading-relaxed text-fc-fg" in:slide={{ duration: 150 }}>
                                  {email.textBody}
                                </p>
                              {/if}
                              {#if email.error}
                                <p class="mt-1 text-fc-xs text-fc-danger">{email.error}</p>
                              {/if}
                            </div>
                            <Icon
                              icon={expandedEmailId === email.id ? icons.chevronUp : icons.chevronDown}
                              size={14}
                              class="mt-1 text-fc-fg-muted"
                            />
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </Card>
  {/if}
</div>

{#if composing}
  <Composer
    bind:open={composerOpen}
    person={{ id: composing.leadId, firstName: composing.firstName, lastName: composing.lastName, email: composing.email, companyName: composing.businessName || composing.domain }}
    onSend={sendToLead}
    onDone={sent}
  />
{/if}
