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

  function getScoreCircleColor(score: number): string {
    if (score >= 70) return 'bg-green-500';
    if (score >= 40) return 'bg-yellow-400';
    return 'bg-orange-500';
  }

  function getStatusIcon(status: Lead['status']): { icon: string; class: string } {
    const icons = {
      HOT: { icon: 'solar:fire-bold', class: 'text-orange-500' },
      WARM: { icon: 'solar:sun-2-bold', class: 'text-yellow-500' },
      COLD: { icon: 'solar:snowflake-bold', class: 'text-blue-400' },
    };
    return icons[status];
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

<div class="overflow-x-auto">
  <table class="w-full text-left border-collapse">
    <thead>
      <tr class="bg-white border-b-2 border-neutral-200">
        <th
          onclick={() => onSort('domain')}
          class="px-8 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500 cursor-pointer hover:text-black transition"
        >
          <div class="flex items-center gap-2">
            <span>Cible</span>
            {#if sortBy === 'domain'}
              <iconify-icon icon="solar:sort-{sortOrder === 'asc' ? 'from-bottom' : 'from-top'}-bold" width="14"></iconify-icon>
            {/if}
          </div>
        </th>
        <th
          onclick={() => onSort('email')}
          class="px-8 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500 cursor-pointer hover:text-black transition"
        >
          <div class="flex items-center gap-2">
            <span>Contact</span>

            {#if sortBy === 'email'}
              <iconify-icon icon="solar:sort-{sortOrder === 'asc' ? 'from-bottom' : 'from-top'}-bold" width="14"></iconify-icon>
            {/if}
          </div>
        </th>
        <th
          onclick={() => onSort('city')}
          class="px-8 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500 cursor-pointer hover:text-black transition"
        >
          <div class="flex items-center gap-2">
            <span>Localisation</span>
            {#if sortBy === 'city' || sortBy === 'country'}
              <iconify-icon icon="solar:sort-{sortOrder === 'asc' ? 'from-bottom' : 'from-top'}-bold" width="14"></iconify-icon>
            {/if}
          </div>
        </th>
        <th class="px-8 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500">
          Statut
        </th>
        <th
          onclick={() => onSort('score')}
          class="px-8 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500 cursor-pointer hover:text-black transition"
        >
          <div class="flex items-center gap-2">
            <span>Score</span>
            {#if sortBy === 'score'}
              <iconify-icon icon="solar:sort-{sortOrder === 'asc' ? 'from-bottom' : 'from-top'}-bold" width="14"></iconify-icon>
            {/if}
          </div>
        </th>
        <th
          onclick={() => onSort('createdAt')}
          class="px-8 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500 cursor-pointer hover:text-black transition"
        >
          <div class="flex items-center gap-2">
            <span>Ajouté</span>
            {#if sortBy === 'createdAt'}
              <iconify-icon icon="solar:sort-{sortOrder === 'asc' ? 'from-bottom' : 'from-top'}-bold" width="14"></iconify-icon>
            {/if}
          </div>
        </th>
      </tr>
    </thead>
    <tbody class="divide-y divide-neutral-100">
      {#each leads as lead}
        <tr
          onclick={() => navigateToLead(lead.id)}
          class="hover:bg-neutral-50/80 transition-all cursor-pointer"
        >
          <!-- Target (Domain) -->
          <td class="px-8 py-4">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-lg border border-neutral-200 bg-white flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
                <img
                  src={getFaviconUrl(lead.domain, 64)}
                  alt="{lead.domain} favicon"
                  class="w-5 h-5"
                  loading="lazy"
                  onerror={(e) => handleFaviconError(e.currentTarget)}
                />
              </div>
              <div class="min-w-0 flex items-center gap-2">
                <iconify-icon icon={getStatusIcon(lead.status).icon} width="16" class="{getStatusIcon(lead.status).class} flex-shrink-0"></iconify-icon>
                <span class="text-neutral-900 font-bold text-sm truncate max-w-[160px] block" title={getLeadTitle(lead)}>
                  {getLeadTitle(lead)}
                </span>
              </div>
            </div>
          </td>

          <!-- Contact -->
          <td class="px-8 py-4">
            <div class="text-sm min-w-0">
              {#if lead.email}
                <div class="text-neutral-900 font-medium truncate max-w-[180px]" title={lead.email}>{lead.email}</div>
              {/if}
              {#if lead.firstName || lead.lastName}
                <div class="text-neutral-500 text-xs truncate max-w-[180px]">
                  {lead.firstName || ''} {lead.lastName || ''}
                </div>
              {/if}
            </div>
          </td>

          <!-- Location -->
          <td class="px-8 py-4">
            <div class="text-sm text-neutral-700 font-medium truncate max-w-[140px]">
              {#if lead.city && lead.country}
                {lead.city}, {lead.country}
              {:else if lead.city}
                {lead.city}
              {:else if lead.country}
                {lead.country}
              {:else}
                <span class="text-neutral-400">—</span>
              {/if}
            </div>
          </td>

          <!-- Status (Contacted) -->
          <td class="px-8 py-4">
            {#if lead.contacted}
              <span class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-green-100 text-green-700">
                <iconify-icon icon="solar:check-circle-bold" width="14" class="mr-1"></iconify-icon>
                Contacté
              </span>
            {:else}
              <span class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-neutral-100 text-neutral-600">
                Non contacté
              </span>
            {/if}
          </td>

          <!-- Score Circle -->
          <td class="px-8 py-4">
            <div
              class="w-10 h-10 rounded-full flex items-center justify-center text-xs font-black text-white {getScoreCircleColor(lead.score)}"
              title="Score: {lead.score}"
            >
              {lead.score}
            </div>
          </td>

          <!-- Time -->
          <td class="px-8 py-4 text-sm text-neutral-500 font-medium whitespace-nowrap">
            {getRelativeTime(lead.createdAt)}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
