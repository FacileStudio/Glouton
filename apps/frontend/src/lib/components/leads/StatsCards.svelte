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
      label: 'Total leads',
      value: stats?.totalLeads ?? 0,
      icon: 'solar:users-group-rounded-bold-duotone',
      color: 'text-black',
    },
    {
      label: 'Avec e-mail',
      value: stats?.totalEmails ?? 0,
      icon: 'solar:letter-bold-duotone',
      color: 'text-purple-500',
    },
    {
      label: 'Avec téléphone',
      value: stats?.totalPhoneNumbers ?? 0,
      icon: 'solar:phone-bold-duotone',
      color: 'text-green-500',
    },
    {
      label: 'Domaines',
      value: stats?.totalDomains ?? 0,
      icon: 'solar:global-bold-duotone',
      color: 'text-blue-500',
    },
    {
      label: 'Profils sociaux',
      value: stats?.totalSocials ?? 0,
      icon: 'solar:share-bold-duotone',
      color: 'text-pink-500',
    },
  ]);
</script>

<section class="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-6">
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
          <div class="w-14 h-14 bg-neutral-50 rounded-2xl flex items-center justify-center flex-shrink-0">
            <iconify-icon icon={stat.icon} class={stat.color} width="28"></iconify-icon>
          </div>
        </div>
        <p class="text-5xl font-black tracking-tighter">{stat.value.toLocaleString()}</p>
      </div>
    {/each}
  {/if}
</section>