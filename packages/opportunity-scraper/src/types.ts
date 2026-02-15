export interface ScrapedOpportunity {
  sourceId: string;
  title: string;
  description: string;
  company?: string;
  sourceUrl: string;
  category: OpportunityCategory;
  tags: string[];
  budget?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  location?: string;
  isRemote: boolean;
  postedAt: Date;
  expiresAt?: Date;
}

export enum OpportunityCategory {
  WEB_DEVELOPMENT = 'WEB_DEVELOPMENT',
  WEB_DESIGN = 'WEB_DESIGN',
  MOBILE_DEVELOPMENT = 'MOBILE_DEVELOPMENT',
  UI_UX_DESIGN = 'UI_UX_DESIGN',
  FRONTEND = 'FRONTEND',
  BACKEND = 'BACKEND',
  FULLSTACK = 'FULLSTACK',
  DEVOPS = 'DEVOPS',
  DATA_SCIENCE = 'DATA_SCIENCE',
  MACHINE_LEARNING = 'MACHINE_LEARNING',
  BLOCKCHAIN = 'BLOCKCHAIN',
  GAME_DEVELOPMENT = 'GAME_DEVELOPMENT',
  WORDPRESS = 'WORDPRESS',
  ECOMMERCE = 'ECOMMERCE',
  SEO = 'SEO',
  CONTENT_WRITING = 'CONTENT_WRITING',
  COPYWRITING = 'COPYWRITING',
  GRAPHIC_DESIGN = 'GRAPHIC_DESIGN',
  VIDEO_EDITING = 'VIDEO_EDITING',
  MARKETING = 'MARKETING',
  CONSULTING = 'CONSULTING',
  OTHER = 'OTHER',
}

export enum OpportunitySource {
  MALT = 'MALT',
  CODEUR = 'CODEUR',
  FREELANCE_INFORMATIQUE = 'FREELANCE_INFORMATIQUE',
  COMET = 'COMET',
  LE_HIBOU = 'LE_HIBOU',
  UPWORK = 'UPWORK',
  FIVERR = 'FIVERR',
  FREELANCER = 'FREELANCER',
  TOPTAL = 'TOPTAL',
  WE_WORK_REMOTELY = 'WE_WORK_REMOTELY',
  REMOTE_CO = 'REMOTE_CO',
  REMOTIVE = 'REMOTIVE',
  LINKEDIN = 'LINKEDIN',
  INDEED = 'INDEED',
  GURU = 'GURU',
  PEOPLEPERHOUR = 'PEOPLEPERHOUR',
}

export interface ScraperConfig {
  source: OpportunitySource;
  enabled: boolean;
  categories?: OpportunityCategory[];
  maxPages?: number;
  timeout?: number;
}

export interface ScraperResult {
  source: OpportunitySource;
  opportunities: ScrapedOpportunity[];
  errors: string[];
  scrapedAt: Date;
}

export interface BaseScraper {
  readonly source: OpportunitySource;
  /**
   * scrape
   */
  scrape(config: ScraperConfig): Promise<ScraperResult>;
}
