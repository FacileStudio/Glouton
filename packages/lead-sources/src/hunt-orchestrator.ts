import type {
  LeadSource,
  LeadSourceProvider,
  LeadSourceFilters,
  LeadData,
} from './types';
import { LeadSourceFactory, type ApiKeys } from './factory';
import { RateLimiter, type RateLimitStatus } from './rate-limiter';

export interface HuntConfig {
  domain?: string;
  filters: Omit<LeadSourceFilters, 'domain'>;
  sources: LeadSource[];
  apiKeys: ApiKeys;
  maxLeadsPerSource?: number;
  respectRateLimits?: boolean;
  onLeadsFound?: (leads: LeadData[]) => void | Promise<void>;
}

export interface HuntProgress {
  totalLeads: number;
  sourceStats: Record<
    LeadSource,
    {
      leads: number;
      errors: number;
      rateLimited: boolean;
      completed: boolean;
    }
  >;
  completedSources: number;
  currentSource: LeadSource | null;
}

export interface HuntResult {
  leads: LeadData[];
  totalLeads: number;
  sourceStats: Record<
    LeadSource,
    {
      leads: number;
      errors: number;
      rateLimited: boolean;
    }
  >;
  rateLimitStatuses: RateLimitStatus[];
}

export class HuntOrchestrator {
  private rateLimiter: RateLimiter;
  private providers: Map<LeadSource, LeadSourceProvider> = new Map();

  

  constructor(customLimits?: Partial<Record<LeadSource, import('./rate-limiter').SourceLimits>>) {
    this.rateLimiter = new RateLimiter(customLimits);
  }

  

  private async initializeProviders(sources: LeadSource[], apiKeys: ApiKeys): Promise<void> {
    this.providers.clear();

    

    for (const source of sources) {
      

      if (source === 'MANUAL') continue;

      try {
        const provider = LeadSourceFactory.create(source, apiKeys);
        this.providers.set(source, provider);
      } catch (error) {
        console.warn(`Failed to initialize ${source} provider:`, error);
      }
    }
  }

  

  private selectNextSource(
    remainingSources: LeadSource[],
    respectRateLimits: boolean,
  ): LeadSource | null {
    

    if (remainingSources.length === 0) return null;

    

    if (!respectRateLimits) {
      return remainingSources[0];
    }

    

    for (const source of remainingSources) {
      const status = this.rateLimiter.getStatus(source);
      

      if (status.canMakeRequest) {
        return source;
      }
    }

    const bestSource = this.rateLimiter.getBestSource();
    

    if (bestSource && remainingSources.includes(bestSource)) {
      return bestSource;
    }

    return null;
  }

  

  async hunt(
    config: HuntConfig,
    onProgress?: (progress: HuntProgress) => void | Promise<void>,
  ): Promise<HuntResult> {
    const {
      domain,
      filters,
      sources,
      apiKeys,
      maxLeadsPerSource = 100,
      respectRateLimits = true,
      onLeadsFound,
    } = config;

    await this.initializeProviders(sources, apiKeys);

    const allLeads: LeadData[] = [];
    const sourceStats: Record<string, { leads: number; errors: number; rateLimited: boolean }> =
      {};

    

    for (const source of sources) {
      sourceStats[source] = { leads: 0, errors: 0, rateLimited: false };
    }

    const remainingSources = [...sources.filter((s) => this.providers.has(s))];
    let completedSources = 0;

    

    while (remainingSources.length > 0) {
      const source = this.selectNextSource(remainingSources, respectRateLimits);

      

      if (!source) {
        

        if (respectRateLimits) {
          console.log('All sources are rate limited. Trying to wait...');
          await new Promise((resolve) => setTimeout(resolve, 10000));
          continue;
        } else {
          break;
        }
      }

      const provider = this.providers.get(source);
      

      if (!provider) {
        remainingSources.splice(remainingSources.indexOf(source), 1);
        continue;
      }

      

      if (onProgress) {
        await onProgress({
          totalLeads: allLeads.length,
          sourceStats: Object.fromEntries(
            Object.entries(sourceStats).map(([s, stats]) => [
              s,
              { ...stats, completed: !remainingSources.includes(s as LeadSource) },
            ]),
          ) as any,
          completedSources,
          currentSource: source,
        });
      }

      const canProceed = respectRateLimits
        ? await this.rateLimiter.checkAndConsume(source)
        : true;

      

      if (!canProceed) {
        sourceStats[source].rateLimited = true;
        remainingSources.splice(remainingSources.indexOf(source), 1);
        completedSources++;
        continue;
      }

      try {
        const searchFilters: LeadSourceFilters = {
          domain,
          ...filters,
          limit: Math.min(maxLeadsPerSource, filters.limit || maxLeadsPerSource),
        };

        const result = await provider.search(searchFilters);

        const newLeads = result.leads.filter(
          (newLead) => !allLeads.some((existingLead) => existingLead.email === newLead.email),
        );

        allLeads.push(...newLeads);
        sourceStats[source].leads = newLeads.length;

        console.log(`${source}: Found ${newLeads.length} new leads (${result.leads.length} total)`);

        

        if (newLeads.length > 0 && onLeadsFound) {
          await onLeadsFound(newLeads);
        }

        const baseDelay = source === 'HUNTER' ? 4500 : 1000;
        const jitter = Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error searching ${source}:`, errorMessage);
        sourceStats[source].errors++;

        

        if (error instanceof Error && (error.name === 'RateLimitError' || error.message === 'RATE_LIMIT')) {
          sourceStats[source].rateLimited = true;

          

          const retryAfter = (error as any).retryAfter || 20000;
          const jitter = Math.random() * 5000;
          const delay = retryAfter + jitter;

          console.log(`${source}: Rate limited, waiting ${Math.round(delay / 1000)}s before continuing...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      remainingSources.splice(remainingSources.indexOf(source), 1);
      completedSources++;

      

      if (onProgress) {
        await onProgress({
          totalLeads: allLeads.length,
          sourceStats: Object.fromEntries(
            Object.entries(sourceStats).map(([s, stats]) => [
              s,
              { ...stats, completed: !remainingSources.includes(s as LeadSource) },
            ]),
          ) as any,
          completedSources,
          currentSource: remainingSources[0] || null,
        });
      }
    }

    const rateLimitStatuses = this.rateLimiter.getAllStatuses();

    return {
      leads: allLeads,
      totalLeads: allLeads.length,
      sourceStats,
      rateLimitStatuses,
    };
  }

  

  getRateLimitStatus(source?: LeadSource): RateLimitStatus | RateLimitStatus[] {
    

    if (source) {
      return this.rateLimiter.getStatus(source);
    }
    return this.rateLimiter.getAllStatuses();
  }

  

  exportRateLimiterState(): string {
    return this.rateLimiter.exportState();
  }

  

  importRateLimiterState(state: string): void {
    this.rateLimiter.importState(state);
  }
}
