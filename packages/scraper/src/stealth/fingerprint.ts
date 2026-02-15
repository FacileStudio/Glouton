const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
];

/**
 * getRandomUserAgent
 */
export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * generateFingerprint
 */
export function generateFingerprint() {
  return {
    userAgent: getRandomUserAgent(),
    viewport: getRandomViewport(),
    platform: getRandomPlatform(),
    vendor: 'Google Inc.',
    languages: ['en-US', 'en'],
    colorDepth: 24,
    pixelRatio: getRandomPixelRatio(),
    hardwareConcurrency: getRandomConcurrency(),
    deviceMemory: getRandomMemory(),
    timezone: getRandomTimezone(),
  };
}

/**
 * getRandomViewport
 */
function getRandomViewport() {
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1280, height: 720 },
    { width: 1600, height: 900 },
  ];
  return viewports[Math.floor(Math.random() * viewports.length)];
}

/**
 * getRandomPlatform
 */
function getRandomPlatform() {
  const platforms = ['Win32', 'MacIntel', 'Linux x86_64'];
  return platforms[Math.floor(Math.random() * platforms.length)];
}

/**
 * getRandomPixelRatio
 */
function getRandomPixelRatio() {
  const ratios = [1, 1.5, 2];
  return ratios[Math.floor(Math.random() * ratios.length)];
}

/**
 * getRandomConcurrency
 */
function getRandomConcurrency() {
  const cores = [4, 8, 12, 16];
  return cores[Math.floor(Math.random() * cores.length)];
}

/**
 * getRandomMemory
 */
function getRandomMemory() {
  const memory = [4, 8, 16];
  return memory[Math.floor(Math.random() * memory.length)];
}

/**
 * getRandomTimezone
 */
function getRandomTimezone() {
  const timezones = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Asia/Tokyo',
  ];
  return timezones[Math.floor(Math.random() * timezones.length)];
}

/**
 * generateBrowserHeaders
 */
export function generateBrowserHeaders(userAgent: string) {
  return {
    'User-Agent': userAgent,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    DNT: '1',
    Connection: 'keep-alive',
  };
}

export class FingerprintRotator {
  private currentFingerprint = generateFingerprint();
  private lastRotation = Date.now();
  private rotationInterval = 1000 * 60 * 30;

  /**
   * shouldRotate
   */
  shouldRotate(): boolean {
    return Date.now() - this.lastRotation > this.rotationInterval;
  }

  /**
   * rotate
   */
  rotate(): void {
    this.currentFingerprint = generateFingerprint();
    this.lastRotation = Date.now();
  }

  /**
   * getFingerprint
   */
  getFingerprint() {
    /**
     * if
     */
    if (this.shouldRotate()) {
      this.rotate();
    }
    return this.currentFingerprint;
  }
}
