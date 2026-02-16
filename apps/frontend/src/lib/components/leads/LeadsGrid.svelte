<script lang="ts">
  import { goto } from '$app/navigation';
  import { getFaviconUrl, handleFaviconError } from '$lib/utils/favicon';
  import 'iconify-icon';

  interface Lead {
    id: string;
    domain: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    city: string | null;
    country: string | null;
    status: 'HOT' | 'WARM' | 'COLD';
    score: number;
    technologies: string[];
    contacted: boolean;
    createdAt: string;
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

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'HOT':
        return 'bg-orange-100 text-orange-700';
      case 'WARM':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-blue-100 text-blue-700';
    }
  }

  function navigateToLead(leadId: string) {
    goto(`/app/leads/${leadId}`);
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
            <h3 class="font-black text-neutral-900 truncate text-lg" title={lead.domain}>
              {lead.domain}
            </h3>
          </div>
        </div>

        <!-- Contact Status Badge -->
        <div class="mb-4">
          {#if lead.contacted}
            <span class="inline-flex items-center px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-black uppercase">
              ✅ Contacted
            </span>
          {:else}
            <span class="inline-flex items-center px-3 py-1.5 bg-neutral-100 text-neutral-600 rounded-lg text-xs font-bold uppercase">
              Not contacted
            </span>
          {/if}
        </div>

        <!-- Contact Info -->
        <div class="space-y-2 mb-4">
          {#if lead.email}
            <div class="flex items-center gap-2 text-sm text-neutral-700">
              <iconify-icon icon="solar:letter-bold" width="16" class="text-neutral-400"></iconify-icon>
              <span class="truncate font-medium">{lead.email}</span>
            </div>
          {/if}
          {#if lead.firstName || lead.lastName}
            <div class="flex items-center gap-2 text-sm text-neutral-700">
              <iconify-icon icon="solar:user-bold" width="16" class="text-neutral-400"></iconify-icon>
              <span class="font-medium">{lead.firstName || ''} {lead.lastName || ''}</span>
            </div>
          {/if}
          {#if lead.city || lead.country}
            <div class="flex items-center gap-2 text-sm text-neutral-700">
              <iconify-icon icon="solar:map-point-bold" width="16" class="text-neutral-400"></iconify-icon>
              <span class="font-medium">
                {#if lead.city}{lead.city}{#if lead.country}, {/if}{/if}
                {#if lead.country}{lead.country}{/if}
              </span>
            </div>
          {/if}
        </div>

        <!-- Status and Score -->
        <div class="flex items-center justify-between mb-4">
          <span class="inline-flex items-center px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide {getStatusColor(lead.status)}">
            {lead.status}
          </span>

          <div class="flex items-center gap-2">
            <div class="w-16 h-2 bg-neutral-200 rounded-full overflow-hidden">
              <div
                class="h-full {lead.score >= 70 ? 'bg-green-500' : lead.score >= 40 ? 'bg-yellow-500' : 'bg-orange-500'}"
                style="width: {lead.score}%"
              ></div>
            </div>
            <span class="text-xs font-bold text-neutral-600">{lead.score}</span>
          </div>
        </div>

        <!-- Technologies -->
        {#if lead.technologies.length > 0}
          <div class="flex flex-wrap gap-1 mb-4">
            {#each lead.technologies.slice(0, 3) as tech}
              <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-800">
                {tech}
              </span>
            {/each}
            {#if lead.technologies.length > 3}
              <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-neutral-100 text-neutral-600">
                +{lead.technologies.length - 3}
              </span>
            {/if}
          </div>
        {/if}

        <!-- Footer with time -->
        <div class="pt-4 border-t border-neutral-100">
          <div class="flex items-center justify-between">
            <span class="text-xs text-neutral-500 font-medium">
              Added {getRelativeTime(lead.createdAt)}
            </span>
            <iconify-icon icon="solar:arrow-right-bold" width="16" class="text-neutral-400"></iconify-icon>
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>