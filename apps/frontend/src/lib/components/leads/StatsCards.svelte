<script lang="ts">
  import 'iconify-icon';
  import { Skeleton } from '@repo/ui';

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
    {
      label: 'Leads',
      value: stats?.totalLeads ?? 0,
      icon: 'solar:users-group-rounded-linear',
    },
    {
      label: 'Emails',
      value: stats?.totalEmails ?? 0,
      icon: 'solar:letter-linear',
    },
    {
      label: 'Téléphones',
      value: stats?.totalPhoneNumbers ?? 0,
      icon: 'solar:phone-linear',
    },
    {
      label: 'Domaines',
      value: stats?.totalDomains ?? 0,
      icon: 'solar:global-linear',
    },
    {
      label: 'Profils sociaux',
      value: stats?.totalSocials ?? 0,
      icon: 'solar:share-linear',
    },
  ]);
</script>

<section class="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
  {#if !stats}
    {#each Array(5) as _, i}
      <div class="rounded-xl border border-border bg-card p-4">
        <div class="flex items-center justify-between mb-3">
          <Skeleton width="80px" height="1rem" rounded="md" />
          <Skeleton width="20px" height="20px" rounded="md" />
        </div>
        <Skeleton width="60px" height="2rem" rounded="md" />
      </div>
    {/each}
  {:else}
    {#each statCards as stat}
      <div class="rounded-xl border border-border bg-card p-4">
        <div class="flex items-center justify-between mb-2">
          <p class="text-xs text-muted-foreground">{stat.label}</p>
          <iconify-icon icon={stat.icon} class="text-muted-foreground" width="16"></iconify-icon>
        </div>
        <p class="text-2xl font-semibold tracking-tight text-foreground">{stat.value.toLocaleString()}</p>
      </div>
    {/each}
  {/if}
</section>
