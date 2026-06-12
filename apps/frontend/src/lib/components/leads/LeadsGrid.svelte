<script lang="ts">
  import { goto } from '$app/navigation';
  import { getFaviconUrl, handleFaviconError } from '$lib/utils/favicon';
  import 'iconify-icon';

  interface Lead {
    id: string;
    domain: string | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    businessName: string | null;
    city: string | null;
    country: string | null;
    status: 'HOT' | 'WARM' | 'COLD';
    score: number;
    technologies: string[];
    contacted: boolean;
    createdAt: string;
    companyInfo: { name?: string } | null;
  }

  let {
    leads,
  }: {
    leads: Lead[];
  } = $props();

  function getRelativeTime(date: string): string {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `Il y a ${diffDays}j`;
    if (diffHours > 0) return `Il y a ${diffHours}h`;
    if (diffMins > 0) return `Il y a ${diffMins}min`;
    return "À l'instant";
  }

  function getStatusBadge(status: Lead['status']): string {
    if (status === 'HOT') return 'bg-destructive/10 text-destructive';
    return 'bg-muted text-foreground';
  }

  function navigateToLead(leadId: string) {
    goto(`/app/leads/${leadId}`);
  }

  function getLeadTitle(lead: Lead): string {
    if (lead.businessName) return lead.businessName;
    if (lead.companyInfo?.name) return lead.companyInfo.name;
    if (lead.firstName || lead.lastName) return [lead.firstName, lead.lastName].filter(Boolean).join(' ');
    if (lead.domain) return lead.domain;
    return '-';
  }
</script>

<div class="p-6">
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    {#each leads as lead}
      <div
        onclick={() => navigateToLead(lead.id)}
        onkeydown={(e) => e.key === 'Enter' && navigateToLead(lead.id)}
        role="button"
        tabindex="0"
        class="rounded-xl border border-border bg-card p-4 hover:bg-muted/40 transition-colors cursor-pointer"
      >
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <div class="size-9 rounded-lg border border-border bg-background flex items-center justify-center overflow-hidden shrink-0">
              <img
                src={getFaviconUrl(lead.domain, 64)}
                alt="{lead.domain} favicon"
                class="w-5 h-5"
                loading="lazy"
                onerror={(e) => handleFaviconError(e.currentTarget)}
              />
            </div>
            <h3 class="text-sm font-semibold text-foreground truncate" title={getLeadTitle(lead)}>
              {getLeadTitle(lead)}
            </h3>
          </div>

          <span class="text-sm font-medium text-foreground shrink-0" title="Score: {lead.score}">
            {lead.score}
          </span>
        </div>

        <div class="flex items-center gap-1.5 flex-wrap mb-3">
          <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusBadge(lead.status)}">
            {lead.status}
          </span>
          {#if lead.contacted}
            <span class="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
              Contacté
            </span>
          {/if}
        </div>

        <div class="space-y-1.5 mb-3">
          {#if lead.email}
            <div class="flex items-center gap-2 text-sm text-foreground min-w-0">
              <iconify-icon icon="solar:letter-linear" width="14" class="text-muted-foreground shrink-0"></iconify-icon>
              <span class="truncate" title={lead.email}>{lead.email}</span>
            </div>
          {/if}
          {#if lead.firstName || lead.lastName}
            <div class="flex items-center gap-2 text-sm text-foreground min-w-0">
              <iconify-icon icon="solar:user-linear" width="14" class="text-muted-foreground shrink-0"></iconify-icon>
              <span class="truncate">{lead.firstName || ''} {lead.lastName || ''}</span>
            </div>
          {/if}
          {#if lead.city || lead.country}
            <div class="flex items-center gap-2 text-sm text-foreground min-w-0">
              <iconify-icon icon="solar:map-point-linear" width="14" class="text-muted-foreground shrink-0"></iconify-icon>
              <span class="truncate">
                {#if lead.city}{lead.city}{#if lead.country}, {/if}{/if}
                {#if lead.country}{lead.country}{/if}
              </span>
            </div>
          {/if}
        </div>

        <div class="pt-3 border-t border-border flex items-center justify-between">
          <span class="text-xs text-muted-foreground">
            {getRelativeTime(lead.createdAt)}
          </span>
          <iconify-icon icon="solar:arrow-right-linear" width="14" class="text-muted-foreground"></iconify-icon>
        </div>
      </div>
    {/each}
  </div>
</div>
