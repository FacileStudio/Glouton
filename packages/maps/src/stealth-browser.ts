import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export interface StealthBrowserOptions {
  headless?: boolean;
  timeout?: number;
}

export class StealthBrowser {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private options: StealthBrowserOptions;

  constructor(options: StealthBrowserOptions = {}) {
    this.options = {
      headless: options.headless ?? true,
      timeout: options.timeout ?? 30000,
    };
  }

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: this.options.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=site-per-process',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--no-sandbox',
      ],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
    });

    this.context.setDefaultTimeout(this.options.timeout || 30000);
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async newPage(): Promise<Page> {
    if (!this.context) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }
    const page = await this.context.newPage();

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: 'default', onchange: null } as PermissionStatus)
          : originalQuery(parameters);
    });

    return page;
  }

  async navigateWithRetry(
    page: Page,
    url: string,
    maxRetries: number = 3
  ): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: this.options.timeout,
        });
        return true;
      } catch (error) {
        if (i === maxRetries - 1) {
          console.error(`Failed to navigate to ${url} after ${maxRetries} attempts:`, error);
          return false;
        }
        await page.waitForTimeout(2000 * (i + 1));
      }
    }
    return false;
  }
}