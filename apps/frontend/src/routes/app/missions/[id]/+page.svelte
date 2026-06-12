<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import { Spinner } from '@repo/ui';
  import 'iconify-icon';

  type Tier = 'HOT' | 'WARM' | 'COLD';

  interface Opportunity {
    id: string;
    title: string;
    description: string;
    company: string | null;
    sourcePlatform: string;
    sourceUrl: string;
    category: string;
    tags: string[];
    budget: string | null;
    budgetMin: number | null;
    budgetMax: number | null;
    currency: string | null;
    location: string | null;
    isRemote: boolean;
    postedAt: string;
    relevanceScore: number;
    applicantCount: number | null;
    companyLogo: string | null;
    contractType: string | null;
    experienceLevel: string | null;
    duration: string | null;
    createdAt: string;
    tier: Tier;
  }

  let logoFailed = $state(false);

  let opportunity = $state<Opportunity | null>(null);
  let loading = $state(true);
  let notFound = $state(false);

  const SOURCE_LABELS: Record<string, string> = {
    FREE_WORK: 'FreeWork',
    CODEUR: 'Codeur.com',
    REMOTIVE: 'Remotive',
    REMOTEOK: 'RemoteOK',
    WE_WORK_REMOTELY: 'We Work Remotely',
    HACKER_NEWS: 'HN Hiring',
    JOBICY: 'Jobicy',
    HIMALAYAS: 'Himalayas',
  };

  const TIER_COLORS: Record<Tier, string> = {
    HOT: 'bg-red-500/10 text-red-400 border-red-500/20',
    WARM: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    COLD: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  };

  const TIER_ICONS: Record<Tier, string> = {
    HOT: 'solar:fire-linear',
    WARM: 'solar:sun-linear',
    COLD: 'solar:snowflake-linear',
  };

  const CATEGORY_LABELS: Record<string, string> = {
    WEB_DEVELOPMENT: 'Développement web',
    WEB_DESIGN: 'Web design',
    MOBILE_DEVELOPMENT: 'Développement mobile',
    UI_UX_DESIGN: 'UI/UX Design',
    FRONTEND: 'Frontend',
    BACKEND: 'Backend',
    FULLSTACK: 'Fullstack',
    DEVOPS: 'DevOps',
    DATA_SCIENCE: 'Data science',
    MACHINE_LEARNING: 'Machine learning',
    BLOCKCHAIN: 'Blockchain',
    GAME_DEVELOPMENT: 'Développement de jeux',
    WORDPRESS: 'WordPress',
    ECOMMERCE: 'E-commerce',
    SEO: 'SEO',
    CONTENT_WRITING: 'Rédaction de contenu',
    COPYWRITING: 'Copywriting',
    GRAPHIC_DESIGN: 'Design graphique',
    VIDEO_EDITING: 'Montage vidéo',
    MARKETING: 'Marketing',
    CONSULTING: 'Conseil',
    OTHER: 'Autre',
  };

  function sourceLabel(platform: string): string {
    return SOURCE_LABELS[platform] ?? platform;
  }

  function formatBudget(opp: Opportunity): string {
    if (opp.budget) return opp.budget;
    if (opp.budgetMin && opp.budgetMax) {
      return `${opp.budgetMin.toLocaleString()} – ${opp.budgetMax.toLocaleString()} ${opp.currency ?? '€'}`;
    }
    if (opp.budgetMin) return `${opp.budgetMin.toLocaleString()}+ ${opp.currency ?? '€'}`;
    return '';
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "aujourd'hui";
    if (days === 1) return 'hier';
    if (days < 7) return `il y a ${days}j`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function applicantBadgeClass(count: number): string {
    if (count <= 3) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (count <= 10) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    return 'bg-red-500/10 text-red-400 border-red-500/20';
  }

  async function loadOpportunity() {
    loading = true;
    try {
      opportunity = (await trpc.opportunity.get.query({ id: $page.params.id })) as Opportunity;
    } catch (err: any) {
      if (err?.data?.code === 'NOT_FOUND') {
        notFound = true;
      } else {
        toast.push('Erreur lors du chargement de la mission', 'error');
      }
    } finally {
      loading = false;
    }
  }

  function openSource() {
    if (!opportunity) return;
    // Fire-and-forget click tracking; never block the navigation on it.
    trpc.opportunity.markClicked.mutate({ id: opportunity.id }).catch(() => {});
    window.open(opportunity.sourceUrl, '_blank', 'noopener');
  }

  onMount(loadOpportunity);
</script>

<div class="flex flex-col gap-6 p-6 max-w-4xl mx-auto w-full">
  <!-- Back link -->
  <a
    href="/app/missions"
    class="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
  >
    <iconify-icon icon="solar:arrow-left-linear" width="16"></iconify-icon>
    Retour aux missions
  </a>

  {#if loading}
    <div class="flex items-center justify-center py-24">
      <Spinner size="lg" />
    </div>
  {:else if notFound || !opportunity}
    <div class="flex flex-col items-center gap-3 py-24 text-center">
      <iconify-icon icon="solar:ghost-linear" width="48" class="text-muted-foreground"></iconify-icon>
      <h2 class="text-lg font-semibold">Mission introuvable</h2>
      <p class="text-sm text-muted-foreground">
        Cette mission n'existe plus ou a été retirée des sources.
      </p>
      <a
        href="/app/missions"
        class="mt-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
      >
        Voir toutes les missions
      </a>
    </div>
  {:else}
    <!-- Header card -->
    <div class="rounded-xl border border-border bg-card p-6 flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-2">
        <span
          class={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TIER_COLORS[opportunity.tier]}`}
        >
          <iconify-icon icon={TIER_ICONS[opportunity.tier]} width="13"></iconify-icon>
          {opportunity.tier} · {opportunity.relevanceScore}
        </span>
        <span class="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium">
          {sourceLabel(opportunity.sourcePlatform)}
        </span>
        {#if opportunity.category}
          <span class="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium">
            {CATEGORY_LABELS[opportunity.category] ?? opportunity.category}
          </span>
        {/if}
        {#if opportunity.applicantCount !== null && opportunity.applicantCount !== undefined}
          <span
            class={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${applicantBadgeClass(opportunity.applicantCount)}`}
          >
            <iconify-icon icon="solar:users-group-rounded-linear" width="13"></iconify-icon>
            {opportunity.applicantCount} sur le coup
          </span>
        {/if}
      </div>

      <div class="flex items-center gap-4">
        {#if opportunity.companyLogo && !logoFailed}
          <img
            src={opportunity.companyLogo}
            alt={opportunity.company ?? 'Logo'}
            class="size-12 rounded-lg border border-border bg-background object-contain shrink-0"
            onerror={() => (logoFailed = true)}
          />
        {/if}
        <h1 class="text-2xl font-bold tracking-tight">{opportunity.title}</h1>
      </div>

      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
        {#if opportunity.company}
          <span class="flex items-center gap-1.5">
            <iconify-icon icon="solar:buildings-2-linear" width="15"></iconify-icon>
            {opportunity.company}
          </span>
        {/if}
        <span class="flex items-center gap-1.5">
          <iconify-icon icon="solar:calendar-linear" width="15"></iconify-icon>
          Publiée {formatDate(opportunity.postedAt)}
        </span>
        {#if opportunity.location}
          <span class="flex items-center gap-1.5">
            <iconify-icon icon="solar:map-point-linear" width="15"></iconify-icon>
            {opportunity.location}
          </span>
        {/if}
        {#if opportunity.isRemote}
          <span class="flex items-center gap-1.5">
            <iconify-icon icon="solar:home-wifi-linear" width="15"></iconify-icon>
            Remote
          </span>
        {/if}
        {#if opportunity.contractType}
          <span class="flex items-center gap-1.5">
            <iconify-icon icon="solar:case-minimalistic-linear" width="15"></iconify-icon>
            {opportunity.contractType}
          </span>
        {/if}
        {#if opportunity.experienceLevel}
          <span class="flex items-center gap-1.5">
            <iconify-icon icon="solar:medal-ribbons-star-linear" width="15"></iconify-icon>
            {opportunity.experienceLevel}
          </span>
        {/if}
        {#if opportunity.duration}
          <span class="flex items-center gap-1.5">
            <iconify-icon icon="solar:hourglass-line-linear" width="15"></iconify-icon>
            {opportunity.duration}
          </span>
        {/if}
        {#if formatBudget(opportunity)}
          <span class="flex items-center gap-1.5 font-medium text-foreground">
            <iconify-icon icon="solar:wallet-money-linear" width="15"></iconify-icon>
            {formatBudget(opportunity)}
          </span>
        {/if}
      </div>

      {#if opportunity.tags.length > 0}
        <div class="flex flex-wrap gap-1.5">
          {#each opportunity.tags as tag}
            <span class="rounded-md bg-accent px-2 py-0.5 text-xs text-muted-foreground">{tag}</span>
          {/each}
        </div>
      {/if}

      <div class="flex items-center gap-3 pt-1">
        <button
          onclick={openSource}
          class="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <iconify-icon icon="solar:square-top-down-linear" width="16"></iconify-icon>
          Voir l'annonce sur {sourceLabel(opportunity.sourcePlatform)}
        </button>
      </div>
    </div>

    <!-- Description -->
    <div class="rounded-xl border border-border bg-card p-6">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
        Description
      </h2>
      <p class="text-sm leading-relaxed whitespace-pre-line">{opportunity.description}</p>
    </div>
  {/if}
</div>
