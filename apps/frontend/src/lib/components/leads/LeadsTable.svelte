<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { getFaviconUrl, handleFaviconError } from '$lib/utils/favicon';
  import { Badge, Card, Table } from '@facile/muse';
  import { useFormat, useT } from '$lib/i18n';

  const t = useT();
  const format = useFormat();
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
    return format.ago(date);
  }

  function getStatusTone(status: Lead['status']): 'danger' | 'neutral' {
    return status === 'HOT' ? 'danger' : 'neutral';
  }

  const sortColumns = $derived<{ key: string; label: string; active: string[] }[]>([
    { key: 'domain', label: t('leads.col.target'), active: ['domain'] },
    { key: 'email', label: t('leads.col.contact'), active: ['email'] },
    { key: 'city', label: t('leads.sort.location'), active: ['city', 'country'] },
  ]);

  const trailingSortColumns = $derived<{ key: string; label: string; active: string[] }[]>([
    { key: 'score', label: t('leads.sort.score'), active: ['score'] },
    { key: 'createdAt', label: t('leads.col.added'), active: ['createdAt'] },
  ]);

  function navigateToLead(leadId: string) {
    goto(resolve('/app/leads/[id]', { id: leadId }));
  }

  function getLeadTitle(lead: Lead): string {
    if (lead.businessName) return lead.businessName;
    if (lead.companyInfo?.name) return lead.companyInfo.name;
    if (lead.firstName || lead.lastName) return [lead.firstName, lead.lastName].filter(Boolean).join(' ');
    if (lead.domain) return lead.domain;
    return '-';
  }
</script>

{#snippet sortHeader(col: { key: string; label: string; active: string[] })}
  <th aria-sort={col.active.includes(sortBy) ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button
      type="button"
      onclick={() => onSort(col.key)}
      class="-mx-1 inline-flex items-center gap-1.5 rounded-fc-sm px-1 transition-colors hover:text-fc-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring"
    >
      <span>{col.label}</span>
      {#if col.active.includes(sortBy)}
        <iconify-icon icon={sortOrder === 'asc' ? 'mdi:chevron-up' : 'mdi:chevron-down'} width="14" height="14" class="block"></iconify-icon>
      {/if}
    </button>
  </th>
{/snippet}

<Card class="overflow-hidden p-0 md:hidden">
  {#each leads as lead (lead.id)}
    <button
      type="button"
      onclick={() => navigateToLead(lead.id)}
      class="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-fc-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fc-ring"
    >
      <div class="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-fc-md bg-fc-surface">
        <img
          src={getFaviconUrl(lead.domain, 64)}
          alt="{lead.domain} favicon"
          class="h-5 w-5"
          loading="lazy"
          onerror={(e) => handleFaviconError(e.currentTarget)}
        />
      </div>
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <div class="flex items-center gap-2">
          <span class="min-w-0 flex-1 truncate text-fc-sm font-medium text-fc-fg">
            {getLeadTitle(lead)}
          </span>
          <Badge tone={getStatusTone(lead.status)} class="shrink-0">{lead.status}</Badge>
          {#if lead.contacted}
            <Badge class="shrink-0">{t('leads.contacted')}</Badge>
          {/if}
        </div>
        {#if lead.email}
          <p class="truncate text-fc-xs text-fc-fg-muted">{lead.email}</p>
        {/if}
        <p class="truncate text-fc-xs text-fc-fg-muted">
          {#if lead.city || lead.country}
            {[lead.city, lead.country].filter(Boolean).join(', ')}
            ·
          {/if}
          {t('leads.scoreValue', { score: lead.score })}
          · {getRelativeTime(lead.createdAt)}
        </p>
      </div>
      <iconify-icon icon="mdi:chevron-right" width="16" height="16" class="mt-1 block shrink-0 text-fc-fg-muted"></iconify-icon>
    </button>
  {/each}
</Card>

<Table class="hidden md:block">
  <thead>
    <tr>
      {#each sortColumns as col (col.key)}
        {@render sortHeader(col)}
      {/each}
      <th>{t('leads.col.status')}</th>
      {#each trailingSortColumns as col (col.key)}
        {@render sortHeader(col)}
      {/each}
    </tr>
  </thead>
  <tbody>
    {#each leads as lead (lead.id)}
      <tr onclick={() => navigateToLead(lead.id)} class="cursor-pointer transition-colors hover:bg-fc-surface">
        <td>
          <div class="flex items-center gap-3">
            <div class="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-fc-md bg-fc-surface">
              <img
                src={getFaviconUrl(lead.domain, 64)}
                alt="{lead.domain} favicon"
                class="h-5 w-5"
                loading="lazy"
                onerror={(e) => handleFaviconError(e.currentTarget)}
              />
            </div>
            <a
              href={resolve('/app/leads/[id]', { id: lead.id })}
              onclick={(e) => e.stopPropagation()}
              class="max-w-[180px] truncate font-medium text-fc-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fc-ring"
              title={getLeadTitle(lead)}
            >
              {getLeadTitle(lead)}
            </a>
          </div>
        </td>

        <td>
          <div class="min-w-0">
            {#if lead.email}
              <div class="max-w-[180px] truncate text-fc-fg" title={lead.email}>{lead.email}</div>
            {/if}
            {#if lead.firstName || lead.lastName}
              <div class="max-w-[180px] truncate text-fc-xs text-fc-fg-muted">
                {lead.firstName || ''} {lead.lastName || ''}
              </div>
            {/if}
          </div>
        </td>

        <td>
          <div class="max-w-[160px] truncate text-fc-fg">
            {#if lead.city && lead.country}
              {lead.city}, {lead.country}
            {:else if lead.city}
              {lead.city}
            {:else if lead.country}
              {lead.country}
            {:else}
              <span class="text-fc-fg-muted">—</span>
            {/if}
          </div>
        </td>

        <td>
          <div class="flex flex-wrap items-center gap-1.5">
            <Badge tone={getStatusTone(lead.status)}>{lead.status}</Badge>
            {#if lead.contacted}
              <Badge>{t('leads.contacted')}</Badge>
            {/if}
          </div>
        </td>

        <td>
          <span class="font-medium text-fc-fg" title={t('leads.scoreTitle', { score: lead.score })}>{lead.score}</span>
        </td>

        <td class="whitespace-nowrap text-fc-fg-muted">
          {getRelativeTime(lead.createdAt)}
        </td>
      </tr>
    {/each}
  </tbody>
</Table>
