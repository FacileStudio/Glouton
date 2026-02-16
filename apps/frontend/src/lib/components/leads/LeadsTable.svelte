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

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
  }

  function getStatusColor(status: Lead['status']): string {
    const colors = {
      HOT: 'bg-orange-100 text-orange-700',
      WARM: 'bg-yellow-100 text-yellow-700',
      COLD: 'bg-blue-100 text-blue-700',
    };
    return colors[status];
  }

  function navigateToLead(leadId: string) {
    goto(`/app/leads/${leadId}`);
  }
</script>

<div class="overflow-x-auto">
  <div class="px-10 py-8 border-b border-neutral-100 flex items-center gap-4 bg-neutral-50/50">
    <div class="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center">
      <iconify-icon icon="solar:list-bold" width="24"></iconify-icon>
    </div>
    <div>
      <h3 class="font-black tracking-tight text-xl">All Leads</h3>
      <p class="text-sm font-medium text-neutral-400">
        {leads.length} Lead{leads.length !== 1 ? 's' : ''} in database
      </p>
    </div>
  </div>

  <table class="w-full text-left border-collapse">
    <thead>
      <tr class="bg-white border-b-2 border-neutral-200">
        <th
          onclick={() => onSort('domain')}
          class="px-8 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500 cursor-pointer hover:text-black transition"
        >
          <div class="flex items-center gap-2">
            <span>Target</span>
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
            <span>Location</span>
            {#if sortBy === 'city' || sortBy === 'country'}
              <iconify-icon icon="solar:sort-{sortOrder === 'asc' ? 'from-bottom' : 'from-top'}-bold" width="14"></iconify-icon>
            {/if}
          </div>
        </th>
        <th class="px-8 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500">
          Status
        </th>
        <th
          onclick={() => onSort('status')}
          class="px-8 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500 cursor-pointer hover:text-black transition"
        >
          <div class="flex items-center gap-2">
            <span>Priority</span>
            {#if sortBy === 'status'}
              <iconify-icon icon="solar:sort-{sortOrder === 'asc' ? 'from-bottom' : 'from-top'}-bold" width="14"></iconify-icon>
            {/if}
          </div>
        </th>
        <th class="px-8 py-4 text-xs font-bold uppercase tracking-wide text-neutral-500">
          Technologies
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
            <span>Added</span>
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
          <td class="px-8 py-5">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg border border-neutral-200 bg-white flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
                <img
                  src={getFaviconUrl(lead.domain, 64)}
                  alt="{lead.domain} favicon"
                  class="w-6 h-6"
                  loading="lazy"
                  onerror={(e) => handleFaviconError(e.currentTarget)}
                />
              </div>
              <span class="text-neutral-900 font-bold text-sm">{lead.domain}</span>
            </div>
          </td>

          <!-- Contact -->
          <td class="px-8 py-5">
            <div class="text-sm">
              {#if lead.email}
                <div class="text-neutral-900 font-medium">{lead.email}</div>
              {/if}
              {#if lead.firstName || lead.lastName}
                <div class="text-neutral-500 text-xs">
                  {lead.firstName || ''} {lead.lastName || ''}
                </div>
              {/if}
            </div>
          </td>

          <!-- Location -->
          <td class="px-8 py-5">
            <div class="text-sm text-neutral-700 font-medium">
              {#if lead.city && lead.country}
                {lead.city}, {lead.country}
              {:else if lead.city}
                {lead.city}
              {:else if lead.country}
                {lead.country}
              {:else}
                <span class="text-neutral-400">-</span>
              {/if}
            </div>
          </td>

          <!-- Status (Contacted) -->
          <td class="px-8 py-5">
            {#if lead.contacted}
              <span class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-green-100 text-green-700">
                <iconify-icon icon="solar:check-circle-bold" width="14" class="mr-1"></iconify-icon>
                Contacted
              </span>
            {:else}
              <span class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-neutral-100 text-neutral-600">
                Not contacted
              </span>
            {/if}
          </td>

          <!-- Priority -->
          <td class="px-8 py-5">
            <span class="inline-flex items-center px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide {getStatusColor(lead.status)}">
              {lead.status}
            </span>
          </td>

          <!-- Technologies -->
          <td class="px-8 py-5">
            <div class="flex flex-wrap gap-1">
              {#each lead.technologies.slice(0, 2) as tech}
                <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-800">
                  {tech}
                </span>
              {/each}
              {#if lead.technologies.length > 2}
                <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-neutral-100 text-neutral-600">
                  +{lead.technologies.length - 2}
                </span>
              {/if}
            </div>
          </td>

          <!-- Score -->
          <td class="px-8 py-5">
            <div class="flex items-center gap-3">
              <div class="w-16 h-2 bg-neutral-200 rounded-full overflow-hidden">
                <div
                  class="h-full transition-all {lead.score >= 70 ? 'bg-green-500' : lead.score >= 40 ? 'bg-yellow-500' : 'bg-orange-500'}"
                  style="width: {Math.min(lead.score, 100)}%"
                ></div>
              </div>
              <span class="text-sm font-bold text-neutral-600">{lead.score}</span>
            </div>
          </td>

          <!-- Time -->
          <td class="px-8 py-5 text-sm text-neutral-500 font-medium">
            {getRelativeTime(lead.createdAt)}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>