import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { BrowserConfig } from '../types';
import { getRandomUserAgent } from './fingerprint';

const DEFAULT_VIEWPORT_SIZES = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1280, height: 720 },
];

/**
 * getRandomViewport
 */
function getRandomViewport() {
  return DEFAULT_VIEWPORT_SIZES[Math.floor(Math.random() * DEFAULT_VIEWPORT_SIZES.length)];
}

export class StealthBrowser {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private config: BrowserConfig;

  /**
   * constructor
   */
  constructor(config: Partial<BrowserConfig> = {}) {
    const viewport = config.viewport || getRandomViewport();
    this.config = {
      headless: config.headless ?? true,
      timeout: config.timeout ?? 30000,
      viewport,
      userAgent: config.userAgent || getRandomUserAgent(),
    };
  }

  /**
   * initialize
   */
  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=' + this.config.viewport.width + ',' + this.config.viewport.height,
      ],
    });

    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
      userAgent: this.config.userAgent,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: [],
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    await this.applyStealthTechniques(this.context);
  }

  /**
   * applyStealthTechniques
   */
  private async applyStealthTechniques(context: BrowserContext): Promise<void> {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      (window.navigator as any).chrome = {
        runtime: {},
      };

      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          {
            0: { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: '' },
            description: 'Portable Document Format',
            filename: 'internal-pdf-viewer',
            length: 1,
            name: 'Chrome PDF Plugin',
          },
          {
            0: {
              type: 'application/pdf',
              suffixes: 'pdf',
              description: 'Portable Document Format',
            },
            description: 'Portable Document Format',
            filename: 'internal-pdf-viewer',
            length: 1,
            name: 'Chrome PDF Viewer',
          },
          {
            0: {
              type: 'application/x-nacl',
              suffixes: '',
              description: 'Native Client Executable',
            },
            1: {
              type: 'application/x-pnacl',
              suffixes: '',
              description: 'Portable Native Client Executable',
            },
            description: '',
            filename: 'internal-nacl-plugin',
            length: 2,
            name: 'Native Client',
          },
        ],
      });

      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      /**
       * originalQuery
       */
      const originalQuery = (window as any).navigator.permissions.query;
      (window as any).navigator.permissions.query = (parameters: any) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
          : originalQuery(parameters);

      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (parameter) {
        /**
         * if
         */
        if (parameter === 37445) {
          return 'Intel Inc.';
        }
        /**
         * if
         */
        if (parameter === 37446) {
          return 'Intel Iris OpenGL Engine';
        }
        return getParameter.call(this, parameter);
      };

      const toBlob = HTMLCanvasElement.prototype.toBlob;
      const toDataURL = HTMLCanvasElement.prototype.toDataURL;
      const getImageData = CanvasRenderingContext2D.prototype.getImageData;

      /**
       * noisify
       */
      const noisify = (canvas: HTMLCanvasElement, context: CanvasRenderingContext2D | null) => {
        /**
         * if
         */
        if (!context) return;

        const shift = {
          r: Math.floor(Math.random() * 10) - 5,
          g: Math.floor(Math.random() * 10) - 5,
          b: Math.floor(Math.random() * 10) - 5,
          a: Math.floor(Math.random() * 10) - 5,
        };

        const width = canvas.width;
        const height = canvas.height;
        /**
         * if
         */
        if (width && height) {
          const imageData = getImageData.apply(context, [0, 0, width, height]);
          /**
           * for
           */
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = imageData.data[i] + shift.r;
            imageData.data[i + 1] = imageData.data[i + 1] + shift.g;
            imageData.data[i + 2] = imageData.data[i + 2] + shift.b;
            imageData.data[i + 3] = imageData.data[i + 3] + shift.a;
          }
          context.putImageData(imageData, 0, 0);
        }
      };

      HTMLCanvasElement.prototype.toBlob = function (...args) {
        /**
         * noisify
         */
        noisify(this, this.getContext('2d'));
        return toBlob.apply(this, args);
      };

      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        /**
         * noisify
         */
        noisify(this, this.getContext('2d'));
        return toDataURL.apply(this, args);
      };

      CanvasRenderingContext2D.prototype.getImageData = function (...args) {
        const imageData = getImageData.apply(this, args);
        const shift = {
          r: Math.floor(Math.random() * 10) - 5,
          g: Math.floor(Math.random() * 10) - 5,
          b: Math.floor(Math.random() * 10) - 5,
          a: Math.floor(Math.random() * 10) - 5,
        };
        /**
         * for
         */
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] = imageData.data[i] + shift.r;
          imageData.data[i + 1] = imageData.data[i + 1] + shift.g;
          imageData.data[i + 2] = imageData.data[i + 2] + shift.b;
          imageData.data[i + 3] = imageData.data[i + 3] + shift.a;
        }
        return imageData;
      };

      /**
       * delete
       */
      delete (window.navigator as any).webdriver;

      const originalToString = Function.prototype.toString;
      Function.prototype.toString = function () {
        /**
         * if
         */
        if (this === Function.prototype.toString) {
          return 'function toString() { [native code] }';
        }
        /**
         * if
         */
        if (this === navigator.permissions.query) {
          return 'function query() { [native code] }';
        }
        return originalToString.call(this);
      };
    });
  }

  /**
   * newPage
   */
  async newPage(): Promise<Page> {
    /**
     * if
     */
    if (!this.context) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    const page = await this.context.newPage();

    page.setDefaultTimeout(this.config.timeout);
    page.setDefaultNavigationTimeout(this.config.timeout);

    await page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      /**
       * if
       */
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    return page;
  }

  /**
   * close
   */
  async close(): Promise<void> {
    /**
     * closeContext
     */
    const closeContext = async () => {
      /**
       * if
       */
      if (this.context) {
        await Promise.race([
          this.context.close(),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
        this.context = null;
      }
    };

    /**
     * closeBrowser
     */
    const closeBrowser = async () => {
      /**
       * if
       */
      if (this.browser) {
        await Promise.race([
          this.browser.close(),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
        this.browser = null;
      }
    };

    try {
      await closeContext();
    } catch (error) {
      this.context = null;
    }

    try {
      await closeBrowser();
    } catch (error) {
      this.browser = null;
    }
  }

  /**
   * navigateWithRetry
   */
  async navigateWithRetry(page: Page, url: string, maxRetries = 2): Promise<boolean> {
    /**
     * for
     */
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: this.config.timeout,
        });

        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

        return true;
      } catch (error) {
        /**
         * if
         */
        if (attempt === maxRetries) {
          return false;
        }

        const delay = Math.min(500 * Math.pow(2, attempt), 3000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    return false;
  }
}
