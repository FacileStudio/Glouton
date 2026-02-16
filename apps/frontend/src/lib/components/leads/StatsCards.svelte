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
    averageScore: number;
  }

  let { stats = $bindable() }: { stats: Stats | null } = $props();

  const statCards = $derived([
    {
      label: 'Total Leads',
      value: stats?.totalLeads ?? 0,
      icon: 'solar:users-group-rounded-bold-duotone',
      color: 'text-black',
    },
    {
      label: 'Hot Leads',
      value: stats?.hotLeads ?? 0,
      icon: 'solar:fire-bold-duotone',
      color: 'text-orange-500',
    },
    {
      label: 'Warm Leads',
      value: stats?.warmLeads ?? 0,
      icon: 'solar:sun-2-bold-duotone',
      color: 'text-yellow-500',
    },
    {
      label: 'With Email',
      value: stats?.totalEmails ?? 0,
      icon: 'solar:letter-bold-duotone',
      color: 'text-purple-500',
    },
    {
      label: 'With Phone',
      value: stats?.totalPhoneNumbers ?? 0,
      icon: 'solar:phone-bold-duotone',
      color: 'text-green-500',
    },
  ]);
</script>

<section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
  {#if !stats}
    {#each Array(5) as _, i}
      <div class="p-8 rounded-[32px] shadow-lg" style="background-color: #EFEAE6;">
        <div class="flex items-start justify-between mb-6">
          <Skeleton width="120px" height="1.5rem" rounded="md" />
          <Skeleton width="52px" height="52px" rounded="2xl" />
        </div>
        <Skeleton width="80px" height="3.5rem" rounded="md" />
      </div>
    {/each}
  {:else}
    {#each statCards as stat}
      <div class="p-8 rounded-[32px] shadow-lg hover:shadow-xl transition-shadow" style="background-color: #EFEAE6;">
        <div class="flex items-start justify-between mb-6">
          <h3 class="text-lg font-bold text-neutral-700">{stat.label}</h3>
          <div class="p-3 bg-neutral-50 rounded-2xl flex-shrink-0">
            <iconify-icon icon={stat.icon} class={stat.color} width="28"></iconify-icon>
          </div>
        </div>
        <p class="text-5xl font-black tracking-tighter">{stat.value.toLocaleString()}</p>
      </div>
    {/each}
  {/if}
</section>