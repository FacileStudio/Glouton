export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfter: number,
    public readonly attemptsLeft: number,
    public readonly endpoint: string,
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export interface RateLimitInfo {
  remaining: number;
  total: number;
  resetAt: Date;
  endpoint: string;
}

export interface HunterCompany {
  organization: string;
  domain: string;
  emails_count?: {
    personal?: number;
    generic?: number;
    total?: number;
  };
  headcount?: string;
  industry?: string;
  location?: {
    city?: string;
    country?: string;
  };
}

export interface HunterDomainSearchFilters {
  domain?: string;
  company?: string;
  limit?: number;
  offset?: number;

  type?: 'personal' | 'generic';
  seniority?: ('junior' | 'senior' | 'executive')[];
  department?: ('executive' | 'it' | 'finance' | 'management' | 'sales' | 'legal' | 'support' | 'hr' | 'marketing' | 'communication' | 'education' | 'design' | 'health' | 'operations')[];
  required_field?: ('full_name' | 'position' | 'phone_number')[];
  verification_status?: ('valid' | 'accept_all' | 'unknown')[];
  job_titles?: string[];

  location?: {
    continent?: string;
    business_region?: 'AMER' | 'EMEA' | 'APAC' | 'LATAM';
    country?: string;
    state?: string;
    city?: string;
  };
}

export interface HunterDiscoverFilters {
  query?: string;
  headquarters_location?: {
    include?: Array<{
      continent?: string;
      business_region?: 'AMER' | 'EMEA' | 'APAC' | 'LATAM';
      country?: string;
      state?: string;
      city?: string;
    }>;
    exclude?: Array<{
      continent?: string;
      business_region?: 'AMER' | 'EMEA' | 'APAC' | 'LATAM';
      country?: string;
      state?: string;
      city?: string;
    }>;
  };
  industry?: {
    include?: string[];
    exclude?: string[];
  };
  headcount?: string[];
  year_founded?: {
    include?: number[];
    from?: number;
    to?: number;
  };
  limit?: number;
  offset?: number;
}

export interface HunterDomainSearchResult {
  data: {
    domain: string;
    disposable: boolean;
    webmail: boolean;
    accept_all: boolean;
    pattern: string;
    organization: string;
    emails: Array<{
      value: string;
      type: string;
      confidence: number;
      first_name: string;
      last_name: string;
      position: string;
      department: string;
    }>;
  };
  meta: {
    results: number;
    limit: number;
    offset: number;
    params: {
      domain: string;
    };
  };
}

export interface HunterDiscoverResult {
  data: Array<{
    organization: string;
    domain: string;
    emails_count?: {
      personal?: number;
      generic?: number;
      total?: number;
    };
    headcount?: string;
    industry?: string;
    location?: {
      city?: string;
      country?: string;
    };
  }>;
  meta: {
    results: number;
    limit: number;
    offset: number;
  };
}

class HunterRateLimiter {
  private requestTimestamps: { [key: string]: number[] } = {};
  private rateLimitInfo: { [key: string]: RateLimitInfo } = {};

  private limits = {
    discover: { perSecond: 4, perMinute: 45 },
    domainSearch: { perSecond: 10, perMinute: 450 },
    emailFinder: { perSecond: 10, perMinute: 450 },
    emailVerifier: { perSecond: 8, perMinute: 280 },
  };

  updateRateLimitInfo(endpoint: keyof typeof this.limits, headers: Headers): void {
    const remaining = headers.get('x-ratelimit-remaining');
    const limit = headers.get('x-ratelimit-limit');
    const reset = headers.get('x-ratelimit-reset');

    if (remaining && limit) {
      const remainingNum = parseInt(remaining, 10);
      const limitNum = parseInt(limit, 10);
      const resetAt = reset ? new Date(parseInt(reset, 10) * 1000) : new Date(Date.now() + 60000);

      this.rateLimitInfo[endpoint] = {
        remaining: remainingNum,
        total: limitNum,
        resetAt,
        endpoint,
      };

      const usagePercent = ((limitNum - remainingNum) / limitNum) * 100;
      if (usagePercent >= 80) {
        console.warn(`[Hunter API] Rate limit warning for ${endpoint}: ${remainingNum}/${limitNum} requests remaining (${usagePercent.toFixed(1)}% used). Resets at ${resetAt.toISOString()}`);
      }
    }
  }

  getRateLimitInfo(endpoint: keyof typeof this.limits): RateLimitInfo | null {
    return this.rateLimitInfo[endpoint] || null;
  }

  async throttle(endpoint: keyof typeof this.limits): Promise<void> {
    const limit = this.limits[endpoint];

    if (!this.requestTimestamps[endpoint]) {
      this.requestTimestamps[endpoint] = [];
    }

    const timestamps = this.requestTimestamps[endpoint];
    const info = this.rateLimitInfo[endpoint];

    if (info && info.remaining <= 5) {
      const now = Date.now();
      const resetTime = info.resetAt.getTime();
      if (resetTime > now) {
        const waitTime = Math.min(resetTime - now, 60000);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    while (true) {
      const now = Date.now();
      const oneSecondAgo = now - 1000;
      const oneMinuteAgo = now - 60000;

      timestamps.splice(0, timestamps.findIndex(t => t > oneMinuteAgo) === -1 ? 0 : timestamps.findIndex(t => t > oneMinuteAgo));

      const requestsLastSecond = timestamps.filter(t => t > oneSecondAgo).length;
      const requestsLastMinute = timestamps.filter(t => t > oneMinuteAgo).length;

      if (requestsLastSecond >= limit.perSecond) {
        const oldestInWindow = timestamps.filter(t => t > oneSecondAgo)[0];
        const waitTime = 1000 - (now - oldestInWindow) + 100;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      if (requestsLastMinute >= limit.perMinute) {
        const oldestInWindow = timestamps.filter(t => t > oneMinuteAgo)[0];
        const waitTime = 60000 - (now - oldestInWindow) + 100;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      timestamps.push(Date.now());
      break;
    }
  }
}

export class HunterService {
  private apiKey: string;
  private baseUrl = 'https://api.hunter.io/v2';
  private rateLimiter = new HunterRateLimiter();
  private readonly MAX_RETRIES = 3;
  private readonly INITIAL_BACKOFF_MS = 5000;
  private readonly MAX_BACKOFF_MS = 60000;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Hunter.io API key is required');
    }
    this.apiKey = apiKey;
  }

  private calculateBackoff(attempt: number): number {
    const backoff = Math.min(
      this.INITIAL_BACKOFF_MS * Math.pow(2, attempt),
      this.MAX_BACKOFF_MS
    );
    return backoff;
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    endpoint: keyof typeof this.rateLimiter['limits'],
  ): Promise<Response> {
    const timeoutMs = 30000;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });

        clearTimeout(timeout);
        this.rateLimiter.updateRateLimitInfo(endpoint, response.headers);

        if (response.status === 429) {
          const retryAfter = this.calculateBackoff(attempt);
          const attemptsLeft = this.MAX_RETRIES - attempt - 1;

          if (attemptsLeft === 0) {
            throw new RateLimitError(
              `Rate limit exceeded for ${endpoint} after ${this.MAX_RETRIES} attempts`,
              retryAfter,
              0,
              endpoint,
            );
          }

          await new Promise(resolve => setTimeout(resolve, retryAfter));
          continue;
        }

        return response;
      } catch (error) {
        clearTimeout(timeout);

        if (error instanceof RateLimitError) {
          throw error;
        }

        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new Error(`Request timeout after ${timeoutMs}ms`);
          continue;
        }

        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError || new Error(`Failed to fetch ${endpoint} after ${this.MAX_RETRIES} retries`);
  }

  getRateLimitInfo(endpoint: keyof typeof this.rateLimiter['limits']): RateLimitInfo | null {
    return this.rateLimiter.getRateLimitInfo(endpoint);
  }

  private checkRateLimit(endpoint: keyof typeof this.rateLimiter['limits']): void {
    const rateInfo = this.rateLimiter.getRateLimitInfo(endpoint);
    if (rateInfo && rateInfo.remaining <= 0) {
      const now = Date.now();
      const resetTime = rateInfo.resetAt.getTime();
      if (resetTime > now) {
        throw new RateLimitError(
          `Rate limit exhausted for ${endpoint}. ${rateInfo.remaining}/${rateInfo.total} requests remaining.`,
          resetTime - now,
          rateInfo.remaining,
          endpoint
        );
      }
    }
  }

  async domainSearch(filters: HunterDomainSearchFilters): Promise<HunterDomainSearchResult | null> {
    this.checkRateLimit('domainSearch');
    await this.rateLimiter.throttle('domainSearch');

    try {
      if (!filters.domain && !filters.company) {
        return null;
      }

      if (filters.location) {
        const requestBody: any = {
          api_key: this.apiKey,
          limit: filters.limit || 100,
          offset: filters.offset || 0,
        };

        if (filters.domain) requestBody.domain = filters.domain;
        else if (filters.company) requestBody.company = filters.company;

        if (filters.location) requestBody.location = filters.location;
        if (filters.type) requestBody.type = filters.type;
        if (filters.seniority) requestBody.seniority = filters.seniority.join(',');
        if (filters.department) requestBody.department = filters.department.join(',');
        if (filters.required_field) requestBody.required_field = filters.required_field.join(',');
        if (filters.verification_status) requestBody.verification_status = filters.verification_status.join(',');
        if (filters.job_titles) requestBody.job_titles = filters.job_titles.join(',');

        const response = await this.fetchWithRetry(
          `${this.baseUrl}/domain-search`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          },
          'domainSearch'
        );

        if (!response.ok) {
          const errorBody = await response.text();
          let errorDetails = '';
          try {
            const errorJson = JSON.parse(errorBody);
            errorDetails = errorJson.errors?.[0]?.details || errorJson.message || errorBody;
          } catch {
            errorDetails = errorBody;
          }
          throw new Error(`Hunter API error (${response.status}): ${errorDetails}`);
        }
        return await response.json();
      }

      const params = new URLSearchParams();
      if (filters.domain) params.append('domain', filters.domain);
      if (filters.company) params.append('company', filters.company);
      params.append('api_key', this.apiKey);

      if (filters.limit) params.append('limit', filters.limit.toString());
      if (filters.offset) params.append('offset', filters.offset.toString());
      if (filters.type) params.append('type', filters.type);
      if (filters.seniority) params.append('seniority', filters.seniority.join(','));
      if (filters.department) params.append('department', filters.department.join(','));
      if (filters.required_field) params.append('required_field', filters.required_field.join(','));
      if (filters.verification_status) {
        params.append('verification_status', filters.verification_status.join(','));
      }
      if (filters.job_titles) params.append('job_titles', filters.job_titles.join(','));

      const url = `${this.baseUrl}/domain-search?${params.toString()}`;
      const response = await this.fetchWithRetry(url, {}, 'domainSearch');

      if (!response.ok) {
        const errorBody = await response.text();
        let errorDetails = '';
        try {
          const errorJson = JSON.parse(errorBody);
          errorDetails = errorJson.errors?.[0]?.details || errorJson.message || errorBody;
        } catch {
          errorDetails = errorBody;
        }
        throw new Error(`Hunter API error (${response.status}): ${errorDetails}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw error;
      }
      return null;
    }
  }

  async emailFinder(domain: string, firstName: string, lastName: string): Promise<{
    email: string;
    score: number;
  } | null> {
    this.checkRateLimit('emailFinder');
    await this.rateLimiter.throttle('emailFinder');

    try {
      const url = `${this.baseUrl}/email-finder?domain=${encodeURIComponent(domain)}&first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&api_key=${this.apiKey}`;

      const response = await this.fetchWithRetry(url, {}, 'emailFinder');

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return {
        email: data.data?.email,
        score: data.data?.score || 0,
      };
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw error;
      }
      return null;
    }
  }

  async emailVerifier(email: string): Promise<{
    status: string;
    score: number;
  } | null> {
    this.checkRateLimit('emailVerifier');
    await this.rateLimiter.throttle('emailVerifier');

    try {
      const url = `${this.baseUrl}/email-verifier?email=${encodeURIComponent(email)}&api_key=${this.apiKey}`;

      const response = await this.fetchWithRetry(url, {}, 'emailVerifier');

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return {
        status: data.data?.status,
        score: data.data?.score || 0,
      };
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw error;
      }
      return null;
    }
  }

  async discover(filters: HunterDiscoverFilters): Promise<HunterDiscoverResult | null> {
    await this.rateLimiter.throttle('discover');

    try {
      const requestBody: any = {
        api_key: this.apiKey,
        limit: Math.min(filters.limit || 10, 100),
      };

      if (filters.offset !== undefined && filters.offset > 0) {
        requestBody.offset = filters.offset;
      }

      if (filters.query) requestBody.query = filters.query;
      if (filters.headquarters_location) requestBody.headquarters_location = filters.headquarters_location;
      if (filters.industry) requestBody.industry = filters.industry;
      if (filters.headcount) requestBody.headcount = filters.headcount;
      if (filters.year_founded) requestBody.year_founded = filters.year_founded;

      const response = await this.fetchWithRetry(
        `${this.baseUrl}/discover`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        },
        'discover'
      );

      if (!response.ok) {
        const errorBody = await response.text();
        let errorDetails = '';
        try {
          const errorJson = JSON.parse(errorBody);
          errorDetails = errorJson.errors?.[0]?.details || errorJson.message || errorBody;

          if (response.status === 400 && errorDetails.includes('limited to 100')) {
            return null;
          }
        } catch {
          errorDetails = errorBody;
        }
        throw new Error(`Hunter Discover API error (${response.status}): ${errorDetails}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw error;
      }
      return null;
    }
  }
}

export default HunterService;
