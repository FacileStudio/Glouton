import logger from '@repo/logger';
import type {
  LeadSourceProvider,
  LeadSourceFilters,
  LeadSourceResult,
  RateLimitInfo,
} from '../types';

const snovLogger = logger.child({ service: 'snov' });

export class SnovProvider implements LeadSourceProvider {
  readonly name = 'SNOV' as const;
  readonly supportsFilters = {
    type: true,
    seniority: false,
    department: false,
    jobTitles: false,
    location: false,
    verificationStatus: false,
  };

  private readonly baseUrl = 'https://api.snov.io/v1';
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  /**
   * constructor
   */
  constructor(
    private clientId: string,
    private clientSecret: string
  ) {}

  /**
   * getAccessToken
   */
  private async getAccessToken(): Promise<string> {
    /**
     * if
     */
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      snovLogger.debug('Using cached access token');
      return this.accessToken;
    }

    snovLogger.info('Requesting new access token');

    try {
      const response = await fetch(`${this.baseUrl}/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
      });

      /**
       * if
       */
      if (!response.ok) {
        throw new Error(`Token request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

      snovLogger.info({ expiresIn: data.expires_in }, 'Access token obtained successfully');

      return this.accessToken!;
    } catch (error) {
      snovLogger.error({ error }, 'Failed to obtain access token');
      throw error;
    }
  }

  /**
   * search
   */
  async search(filters: LeadSourceFilters): Promise<LeadSourceResult> {
    /**
     * if
     */
    if (!filters.domain) {
      snovLogger.warn({ filters }, 'No domain provided, skipping search');
      return { leads: [], total: 0, hasMore: false };
    }

    snovLogger.info({ domain: filters.domain, filters }, 'Starting Snov search');

    try {
      const token = await this.getAccessToken();

      const response = await fetch(`${this.baseUrl}/domain-emails-with-info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          domain: filters.domain,
          type: filters.type || 'all',
          limit: Math.min(filters.limit || 100, 100),
          lastId: filters.offset || 0,
        }),
      });

      /**
       * if
       */
      if (!response.ok) {
        snovLogger.error({
          domain: filters.domain,
          status: response.status,
          statusText: response.statusText,
        }, 'Snov API request failed');
        return { leads: [], total: 0, hasMore: false };
      }

      const data = await response.json();

      /**
       * leads
       */
      const leads = (data.emails || []).map((item: any) => ({
        sourceId: `snov:${item.email}`,
        email: item.email,
        firstName: item.firstName,
        lastName: item.lastName,
        position: item.position,
        confidence: item.status === 'valid' ? 90 : 50,
        verified: item.status === 'valid',
        metadata: {
          type: item.type,
          source: item.source,
        },
      }));

      snovLogger.info({
        domain: filters.domain,
        leadsFound: leads.length,
        total: data.totalEmails || 0,
        hasMore: Boolean(data.nextPageId),
      }, 'Snov search completed successfully');

      return {
        leads,
        total: data.totalEmails || 0,
        hasMore: Boolean(data.nextPageId),
      };
    } catch (error) {
      snovLogger.error({ domain: filters.domain, error }, 'Snov search failed');
      return { leads: [], total: 0, hasMore: false };
    }
  }

  /**
   * getRateLimit
   */
  async getRateLimit(): Promise<RateLimitInfo> {
    return {
      remaining: 50,
      total: 50,
      resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
  }
}
