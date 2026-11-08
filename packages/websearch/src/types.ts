export type WebSearchErrorCode =
  | 'invalid_input'
  | 'quota_exceeded'
  | 'not_installed'
  | 'timeout'
  | 'output_too_large'
  | 'sonar_failed'
  | 'bad_output';

export class WebSearchError extends Error {
  readonly code: WebSearchErrorCode;

  constructor(code: WebSearchErrorCode, message: string) {
    super(message);
    this.name = 'WebSearchError';
    this.code = code;
  }
}

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  engine: string;
}

export interface SearchOptions {
  count?: number;
  engines?: string[];
  timeoutMs?: number;
}

export interface FetchOptions {
  selector?: string;
  browser?: boolean;
  timeoutMs?: number;
}

export interface FetchedPage {
  url: string;
  markdown: string;
}

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  incrby(key: string, increment: number): Promise<number>;
  decrby(key: string, decrement: number): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

export interface QuotaLimits {
  searches: number;
  fetches: number;
}

export interface Usage {
  searches: number;
  fetches: number;
  limits: QuotaLimits;
}

export interface RunnerConfig {
  bin: string;
  env: Record<string, string | undefined>;
  timeoutMs: number;
  maxOutputBytes: number;
}
