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

  function getScoreCircleColor(score: number): string {
    if (score >= 70) return 'bg-green-500';
    if (score >= 40) return 'bg-yellow-400';
    return 'bg-orange-500';
  }

  function getStatusIcon(status: string): { icon: string; class: string } {
    switch (status) {
      case 'HOT':
        return { icon: 'solar:fire-bold', class: 'text-orange-500' };
      case 'WARM':
        return { icon: 'solar:sun-2-bold', class: 'text-yellow-500' };
      default:
        return { icon: 'solar:snowflake-bold', class: 'text-blue-400' };
    }
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

<div class="p-8">
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
    {#each leads as lead}
      <div
        onclick={() => navigateToLead(lead.id)}
        onkeydown={(e) => e.key === 'Enter' && navigateToLead(lead.id)}
        role="button"
        tabindex="0"
        class="rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all cursor-pointer bg-white"
      >
        <!-- Header -->
        <div class="flex items-start justify-between mb-4">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <div class="w-10 h-10 rounded-lg border border-neutral-200 bg-white flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
              <img
                src={getFaviconUrl(lead.domain, 64)}
                alt="{lead.domain} favicon"
                class="w-6 h-6"
                loading="lazy"
                onerror={(e) => handleFaviconError(e.currentTarget)}
              />
            </div>
            <div class="flex items-center gap-2 min-w-0">
              <iconify-icon icon={getStatusIcon(lead.status).icon} width="18" class="{getStatusIcon(lead.status).class} flex-shrink-0"></iconify-icon>
              <h3 class="font-black text-neutral-900 truncate text-lg" title={getLeadTitle(lead)}>
                {getLeadTitle(lead)}
              </h3>
            </div>
          </div>

          <!-- Score Circle -->
          <div
            class="w-10 h-10 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0 ml-2 {getScoreCircleColor(lead.score)}"
            title="Score: {lead.score}"
          >
            {lead.score}
          </div>
        </div>

        <!-- Contact Status Badge -->
        <div class="mb-4">
          {#if lead.contacted}
            <span class="inline-flex items-center px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-black uppercase">
              <iconify-icon icon="solar:check-circle-bold" width="14" class="mr-1"></iconify-icon>
              Contacté
            </span>
          {:else}
            <span class="inline-flex items-center px-3 py-1.5 bg-neutral-100 text-neutral-600 rounded-lg text-xs font-bold uppercase">
              Non contacté
            </span>
          {/if}
        </div>

        <!-- Contact Info -->
        <div class="space-y-2 mb-4">
          {#if lead.email}
            <div class="flex items-center gap-2 text-sm text-neutral-700 min-w-0">
              <iconify-icon icon="solar:letter-bold" width="16" class="text-neutral-400 flex-shrink-0"></iconify-icon>
              <span class="truncate font-medium" title={lead.email}>{lead.email}</span>
            </div>
          {/if}
          {#if lead.firstName || lead.lastName}
            <div class="flex items-center gap-2 text-sm text-neutral-700 min-w-0">
              <iconify-icon icon="solar:user-bold" width="16" class="text-neutral-400 flex-shrink-0"></iconify-icon>
              <span class="font-medium truncate">{lead.firstName || ''} {lead.lastName || ''}</span>
            </div>
          {/if}
          {#if lead.city || lead.country}
            <div class="flex items-center gap-2 text-sm text-neutral-700 min-w-0">
              <iconify-icon icon="solar:map-point-bold" width="16" class="text-neutral-400 flex-shrink-0"></iconify-icon>
              <span class="font-medium truncate">
                {#if lead.city}{lead.city}{#if lead.country}, {/if}{/if}
                {#if lead.country}{lead.country}{/if}
              </span>
            </div>
          {/if}
        </div>

        <!-- Footer with time -->
        <div class="pt-4 border-t border-neutral-100">
          <div class="flex items-center justify-between">
            <span class="text-xs text-neutral-500 font-medium">
              Ajouté {getRelativeTime(lead.createdAt)}
            </span>
            <iconify-icon icon="solar:arrow-right-bold" width="16" class="text-neutral-400"></iconify-icon>
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>
