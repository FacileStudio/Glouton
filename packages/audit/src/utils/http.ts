import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { AuditError, type RateLimiterConfig } from '../types';

export class RateLimiter {
  private requests: number[] = [];
  private config: RateLimiterConfig;

  

  constructor(config: RateLimiterConfig) {
    this.config = config;
  }

  

  async acquire(): Promise<void> {
    const now = Date.now();
    this.requests = this.requests.filter(
      (timestamp) => now - timestamp < this.config.windowMs
    );

    

    if (this.requests.length >= this.config.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.config.windowMs - (now - oldestRequest!);
      await this.sleep(waitTime);
      return this.acquire();
    }

    this.requests.push(now);
  }

  

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class HttpClient {
  private axiosInstance: AxiosInstance;
  private rateLimiter: RateLimiter;
  private maxRetries: number;
  private retryDelay: number;

  

  constructor(
    timeout: number = 30000,
    userAgent?: string,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ) {
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;

    this.axiosInstance = axios.create({
      timeout,
      headers: {
        'User-Agent':
          userAgent ||
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*

  async get(url: string, config?: AxiosRequestConfig): Promise<string> {
    await this.rateLimiter.acquire();

    let lastError: Error | undefined;
    

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.axiosInstance.get(url, config);

        

        if (response.status >= 400) {
          throw new AuditError(
            `HTTP ${response.status}: ${response.statusText}`,
            'HTTP_ERROR',
            { status: response.status, url }
          );
        }

        return response.data;
      } catch (error) {
        lastError = error as Error;

        

        if (axios.isAxiosError(error)) {
          

          if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            

            if (attempt < this.maxRetries - 1) {
              await this.sleep(this.retryDelay * (attempt + 1));
              continue;
            }
          }

          

          if (error.response?.status && error.response.status >= 500) {
            

            if (attempt < this.maxRetries - 1) {
              await this.sleep(this.retryDelay * (attempt + 1));
              continue;
            }
          }
        }

        

        if (attempt === this.maxRetries - 1) {
          break;
        }
      }
    }

    throw new AuditError(
      `Failed to fetch ${url} after ${this.maxRetries} attempts: ${lastError?.message}`,
      'FETCH_FAILED',
      { url, originalError: lastError }
    );
  }

  

  async head(url: string, config?: AxiosRequestConfig): Promise<Record<string, string>> {
    await this.rateLimiter.acquire();

    try {
      const response = await this.axiosInstance.head(url, config);
      return response.headers as Record<string, string>;
    } catch (error) {
      throw new AuditError(
        `Failed to fetch headers for ${url}: ${(error as Error).message}`,
        'HEAD_FAILED',
        { url, originalError: error }
      );
    }
  }

  

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  

  setRateLimitConfig(config: RateLimiterConfig): void {
    this.rateLimiter = new RateLimiter(config);
  }
}



export function normalizeUrl(url: string): string {
  try {
    

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const urlObj = new URL(url);
    return urlObj.href;
  } catch (error) {
    throw new AuditError(
      `Invalid URL: ${url}`,
      'INVALID_URL',
      { url, originalError: error }
    );
  }
}



export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(normalizeUrl(url));
    return urlObj.hostname.replace(/^www\./, '');
  } catch (error) {
    throw new AuditError(
      `Failed to extract domain from ${url}`,
      'DOMAIN_EXTRACTION_FAILED',
      { url, originalError: error }
    );
  }
}



export function isValidUrl(url: string): boolean {
  try {
    new URL(normalizeUrl(url));
    return true;
  } catch {
    return false;
  }
}
