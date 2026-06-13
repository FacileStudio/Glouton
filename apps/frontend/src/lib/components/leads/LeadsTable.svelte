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
    sortBy = $bindable(),
    sortOrder = $bindable(),
    onSort,
  }: {
    leads: Lead[];
    sortBy: string;
    sortOrder: 'asc' | 'desc';
    onSort: (column: string) => void;
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

<!-- Mobile : liste de cartes, la table à 6 colonnes déborde forcément -->
<div class="md:hidden divide-y divide-border">
  {#each leads as lead}
    <button
      onclick={() => navigateToLead(lead.id)}
      class="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/40"
    >
      <div class="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
        <img
          src={getFaviconUrl(lead.domain, 64)}
          alt="{lead.domain} favicon"
          class="h-5 w-5"
          loading="lazy"
          onerror={(e) => handleFaviconError(e.currentTarget as HTMLImageElement)}
        />
      </div>
      <div class="min-w-0 flex-1 space-y-0.5">
        <div class="flex items-center gap-2">
          <span class="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {getLeadTitle(lead)}
          </span>
          <span class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium {getStatusBadge(lead.status)}">
            {lead.status}
          </span>
          {#if lead.contacted}
            <span class="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground">
              Contacté
            </span>
          {/if}
        </div>
        {#if lead.email}
          <p class="truncate text-xs text-muted-foreground">{lead.email}</p>
        {/if}
        <p class="truncate text-xs text-muted-foreground">
          {#if lead.city || lead.country}
            {[lead.city, lead.country].filter(Boolean).join(', ')}
            ·
          {/if}
          Score {lead.score}
          · {getRelativeTime(lead.createdAt)}
        </p>
      </div>
      <iconify-icon
        icon="solar:alt-arrow-right-linear"
        width="14"
        class="mt-1 shrink-0 text-muted-foreground"
      ></iconify-icon>
    </button>
  {/each}
</div>

<!-- Desktop : table complète -->
<div class="hidden overflow-x-auto md:block">
  <table class="w-full text-left border-collapse">
    <thead>
      <tr class="border-b border-border">
        <th
          onclick={() => onSort('domain')}
          class="px-6 py-3 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
        >
          <div class="flex items-center gap-1.5">
            <span>Cible</span>
            {#if sortBy === 'domain'}
              <iconify-icon icon="solar:sort-{sortOrder === 'asc' ? 'from-bottom' : 'from-top'}-bold" width="12"></iconify-icon>
            {/if}
          </div>
        </th>
        <th
          onclick={() => onSort('email')}
          class="px-6 py-3 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
        >
          <div class="flex items-center gap-1.5">
            <span>Contact</span>
            {#if sortBy === 'email'}
              <iconify-icon icon="solar:sort-{sortOrder === 'asc' ? 'from-bottom' : 'from-top'}-bold" width="12"></iconify-icon>
            {/if}
          </div>
        </th>
        <th
          onclick={() => onSort('city')}
          class="px-6 py-3 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
        >
          <div class="flex items-center gap-1.5">
            <span>Localisation</span>
            {#if sortBy === 'city' || sortBy === 'country'}
              <iconify-icon icon="solar:sort-{sortOrder === 'asc' ? 'from-bottom' : 'from-top'}-bold" width="12"></iconify-icon>
            {/if}
          </div>
        </th>
        <th class="px-6 py-3 text-xs font-medium text-muted-foreground">
          Statut
        </th>
        <th
          onclick={() => onSort('score')}
          class="px-6 py-3 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
        >
          <div class="flex items-center gap-1.5">
            <span>Score</span>
            {#if sortBy === 'score'}
              <iconify-icon icon="solar:sort-{sortOrder === 'asc' ? 'from-bottom' : 'from-top'}-bold" width="12"></iconify-icon>
            {/if}
          </div>
        </th>
        <th
          onclick={() => onSort('createdAt')}
          class="px-6 py-3 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
        >
          <div class="flex items-center gap-1.5">
            <span>Ajouté</span>
            {#if sortBy === 'createdAt'}
              <iconify-icon icon="solar:sort-{sortOrder === 'asc' ? 'from-bottom' : 'from-top'}-bold" width="12"></iconify-icon>
            {/if}
          </div>
        </th>
      </tr>
    </thead>
    <tbody>
      {#each leads as lead}
        <tr
          onclick={() => navigateToLead(lead.id)}
          class="border-b border-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer"
        >
          <td class="px-6 py-3">
            <div class="flex items-center gap-3">
              <div class="size-8 rounded-lg border border-border bg-background flex items-center justify-center overflow-hidden shrink-0">
                <img
                  src={getFaviconUrl(lead.domain, 64)}
                  alt="{lead.domain} favicon"
                  class="w-5 h-5"
                  loading="lazy"
                  onerror={(e) => handleFaviconError(e.currentTarget as HTMLImageElement)}
                />
              </div>
              <span class="text-sm font-medium text-foreground truncate max-w-[180px]" title={getLeadTitle(lead)}>
                {getLeadTitle(lead)}
              </span>
            </div>
          </td>

          <td class="px-6 py-3">
            <div class="text-sm min-w-0">
              {#if lead.email}
                <div class="text-foreground truncate max-w-[180px]" title={lead.email}>{lead.email}</div>
              {/if}
              {#if lead.firstName || lead.lastName}
                <div class="text-xs text-muted-foreground truncate max-w-[180px]">
                  {lead.firstName || ''} {lead.lastName || ''}
                </div>
              {/if}
            </div>
          </td>

          <td class="px-6 py-3">
            <div class="text-sm text-foreground truncate max-w-[160px]">
              {#if lead.city && lead.country}
                {lead.city}, {lead.country}
              {:else if lead.city}
                {lead.city}
              {:else if lead.country}
                {lead.country}
              {:else}
                <span class="text-muted-foreground">—</span>
              {/if}
            </div>
          </td>

          <td class="px-6 py-3">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusBadge(lead.status)}">
                {lead.status}
              </span>
              {#if lead.contacted}
                <span class="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                  Contacté
                </span>
              {/if}
            </div>
          </td>

          <td class="px-6 py-3">
            <span class="text-sm font-medium text-foreground" title="Score: {lead.score}">
              {lead.score}
            </span>
          </td>

          <td class="px-6 py-3 text-sm text-muted-foreground whitespace-nowrap">
            {getRelativeTime(lead.createdAt)}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
