<script lang="ts">
  import { getErrorCode } from '$lib/utils/trpc-error';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { trpc } from '$lib/trpc';
  import { toast, Badge, Button, Card, EmptyState, Icon, Spinner, icons } from '@facile/muse';
  import type { BadgeProps } from '@facile/muse';

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

  type Tone = NonNullable<BadgeProps['tone']>;

  const TIER_TONES: Record<Tier, Tone> = {
    HOT: 'danger',
    WARM: 'warning',
    COLD: 'info',
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

  function applicantTone(count: number): Tone {
    if (count <= 3) return 'success';
    if (count <= 10) return 'warning';
    return 'danger';
  }

  async function loadOpportunity() {
    loading = true;
    try {
      opportunity = (await trpc.opportunity.get.query({ id: page.params.id ?? '' })) as Opportunity;
    } catch (err) {
      if (getErrorCode(err) === 'NOT_FOUND') {
        notFound = true;
      } else {
        toast.danger('Erreur lors du chargement de la mission');
      }
    } finally {
      loading = false;
    }
  }

  function openSource() {
    if (!opportunity) return;
    trpc.opportunity.markClicked.mutate({ id: opportunity.id }).catch(() => {});
    window.open(opportunity.sourceUrl, '_blank', 'noopener');
  }

  onMount(loadOpportunity);
</script>

<div class="flex w-full flex-col gap-6">
  <Button href="/app/missions" variant="ghost" size="sm" icon={icons.chevronLeft} class="-ml-3 w-fit">
    Retour aux missions
  </Button>

  {#if loading}
    <div class="flex items-center justify-center py-24">
      <Spinner size="lg" label="Chargement" />
    </div>
  {:else if notFound || !opportunity}
    <EmptyState
      icon="solar:ghost-linear"
      title="Mission introuvable"
      description="Cette mission n'existe plus ou a été retirée des sources."
    >
      <Button href="/app/missions" variant="outline">Voir toutes les missions</Button>
    </EmptyState>
  {:else}
    <Card class="flex flex-col gap-4 p-6">
      <div class="flex flex-wrap items-center gap-2">
        <Badge tone={TIER_TONES[opportunity.tier]}>
          <Icon icon={TIER_ICONS[opportunity.tier]} size={13} />
          {opportunity.tier} · {opportunity.relevanceScore}
        </Badge>
        <Badge>{sourceLabel(opportunity.sourcePlatform)}</Badge>
        {#if opportunity.category}
          <Badge>{CATEGORY_LABELS[opportunity.category] ?? opportunity.category}</Badge>
        {/if}
        {#if opportunity.applicantCount !== null && opportunity.applicantCount !== undefined}
          <Badge tone={applicantTone(opportunity.applicantCount)}>
            <Icon icon="solar:users-group-rounded-linear" size={13} />
            {opportunity.applicantCount} sur le coup
          </Badge>
        {/if}
      </div>

      <div class="flex items-center gap-4">
        {#if opportunity.companyLogo && !logoFailed}
          <img
            src={opportunity.companyLogo}
            alt={opportunity.company ?? 'Logo'}
            class="size-12 shrink-0 rounded-fc-md bg-fc-bg object-contain"
            onerror={() => (logoFailed = true)}
          />
        {/if}
        <h1 class="min-w-0 break-words text-fc-2xl font-semibold text-fc-fg">{opportunity.title}</h1>
      </div>

      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-fc-sm text-fc-fg-muted">
        {#if opportunity.company}
          <span class="flex items-center gap-1.5">
            <Icon icon="solar:buildings-2-linear" size={15} />
            {opportunity.company}
          </span>
        {/if}
        <span class="flex items-center gap-1.5">
          <Icon icon={icons.calendar} size={15} />
          Publiée {formatDate(opportunity.postedAt)}
        </span>
        {#if opportunity.location}
          <span class="flex items-center gap-1.5">
            <Icon icon="solar:map-point-linear" size={15} />
            {opportunity.location}
          </span>
        {/if}
        {#if opportunity.isRemote}
          <span class="flex items-center gap-1.5">
            <Icon icon="solar:home-wifi-linear" size={15} />
            Remote
          </span>
        {/if}
        {#if opportunity.contractType}
          <span class="flex items-center gap-1.5">
            <Icon icon="solar:case-minimalistic-linear" size={15} />
            {opportunity.contractType}
          </span>
        {/if}
        {#if opportunity.experienceLevel}
          <span class="flex items-center gap-1.5">
            <Icon icon="solar:medal-ribbons-star-linear" size={15} />
            {opportunity.experienceLevel}
          </span>
        {/if}
        {#if opportunity.duration}
          <span class="flex items-center gap-1.5">
            <Icon icon="solar:hourglass-line-linear" size={15} />
            {opportunity.duration}
          </span>
        {/if}
        {#if formatBudget(opportunity)}
          <span class="flex items-center gap-1.5 font-medium text-fc-fg">
            <Icon icon="solar:wallet-money-linear" size={15} />
            {formatBudget(opportunity)}
          </span>
        {/if}
      </div>

      {#if opportunity.tags.length > 0}
        <div class="flex flex-wrap gap-1.5">
          {#each opportunity.tags as tag, i (i)}
            <Badge>{tag}</Badge>
          {/each}
        </div>
      {/if}

      <div class="flex items-center gap-3 pt-1">
        <Button size="lg" icon="solar:square-top-down-linear" onclick={openSource}>
          Voir l'annonce sur {sourceLabel(opportunity.sourcePlatform)}
        </Button>
      </div>
    </Card>

    <Card class="p-6">
      <h2 class="mb-3 text-fc-sm font-semibold uppercase tracking-wide text-fc-fg-muted">
        Description
      </h2>
      <p class="whitespace-pre-line text-fc-sm leading-relaxed text-fc-fg">{opportunity.description}</p>
    </Card>
  {/if}
</div>
