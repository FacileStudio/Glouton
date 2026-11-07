<script lang="ts">
  import { Card, Skeleton, StatCard } from '@facile/muse';
  import { useT } from '$lib/i18n';

  const t = useT();

  interface Stats {
    totalLeads: number;
    hotLeads: number;
    warmLeads: number;
    coldLeads: number;
    contactableLeads: number;
    contactedLeads: number;
    totalEmails: number;
    totalPhoneNumbers: number;
    totalDomains: number;
    totalSocials: number;
    averageScore: number;
  }

  let { stats = $bindable() }: { stats: Stats | null } = $props();

  const statCards = $derived([
    { label: t('leads.stats.leads'), value: stats?.totalLeads ?? 0 },
    { label: t('leads.stats.emails'), value: stats?.totalEmails ?? 0 },
    { label: t('leads.stats.phones'), value: stats?.totalPhoneNumbers ?? 0 },
    { label: t('leads.stats.domains'), value: stats?.totalDomains ?? 0 },
    { label: t('leads.stats.socials'), value: stats?.totalSocials ?? 0 },
  ]);
</script>

<section class="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
  {#if !stats}
    {#each Array(5) as _, i (i)}
      <Card class="flex flex-col gap-2">
        <Skeleton class="h-4 w-20" />
        <Skeleton class="h-8 w-16" />
      </Card>
    {/each}
  {:else}
    {#each statCards as stat (stat.label)}
      <StatCard label={stat.label} value={stat.value.toLocaleString()} />
    {/each}
  {/if}
</section>
