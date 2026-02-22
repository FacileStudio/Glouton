import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';



export function parseHtml(html: string): CheerioAPI {
  return cheerio.load(html);
}



export function extractEmails(text: string): string[] {
  const emailRegex = /\b[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}\b/gi;
  const emails = text.match(emailRegex) || [];

  const personalDomains = ['gmail', 'yahoo', 'hotmail', 'outlook', 'aol', 'icloud', 'protonmail', 'proton'];
  const fileExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.css', '.js', '.woff', '.woff2', '.ttf', '.eot'];

  return [...new Set(emails)]
    .filter(email => {
      const lowerEmail = email.toLowerCase();

      if (fileExtensions.some(ext => lowerEmail.endsWith(ext))) {
        return false;
      }

      if (lowerEmail.includes('example.com') || lowerEmail.includes('test.com') || lowerEmail.includes('yoursite.com')) {
        return false;
      }

      const domain = email.split('@')[1]?.toLowerCase();
      if (!domain) return false;

      if (domain.length < 4) return false;

      return !personalDomains.some(d => domain.includes(d + '.') || domain === d);
    })
    .sort((a, b) => {
      const getPriority = (email: string) => {
        const lower = email.toLowerCase();
        const localPart = lower.split('@')[0] || '';

        if (localPart === 'info' || localPart === 'contact') return 1;
        if (localPart === 'hello' || localPart === 'support') return 2;
        if (localPart === 'admin' || localPart === 'sales') return 3;
        if (localPart === 'team' || localPart === 'hello') return 4;
        if (localPart.includes('noreply') || localPart.includes('no-reply')) return 10;
        return 5;
      };
      return getPriority(a) - getPriority(b);
    });
}



export function extractPhones(text: string): string[] {
  const phoneRegexes = [
    /(?:\+|00)(?:[0-9]{1,3})?[\s.-]?(?:\(?\d{1,4}\)?)?[\s.-]?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{1,9}/g,
    /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{2,4}/g,
    /\(\d{3}\)\s?\d{3}[-.\s]?\d{4}/g,
    /\d{3}[-.\s]\d{3}[-.\s]\d{4}/g,
    /\d{2,3}[-.\s]\d{2,3}[-.\s]\d{2,3}[-.\s]\d{2,3}/g,
    /(?:\+33|0033|0)[1-9](?:[\s.-]?\d{2}){4}/g,
    /(?:\+44|0044|0)\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g,
    /(?:\+1|001)?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
  ];

  const phones: string[] = [];
  for (const regex of phoneRegexes) {
    const matches = text.match(regex) || [];
    phones.push(...matches);
  }

  const blacklistPatterns = [
    /^\d{1,4}$/,
    /^[\d\s.-]+$/,
    /^[0-9]{1,6}$/,
    /\d{4}[-./]\d{2}[-./]\d{2}/,
    /\d{2}[-./]\d{2}[-./]\d{4}/,
    /copyright|©|price|isbn/i,
  ];

  return [...new Set(phones)]
    .filter((phone) => {
      const digitsOnly = phone.replace(/\D/g, '');

      if (digitsOnly.length < 10 || digitsOnly.length > 15) return false;

      if (blacklistPatterns.some(pattern => pattern.test(phone))) return false;

      const consecutiveSame = /(\d)\1{6,}/;
      if (consecutiveSame.test(digitsOnly)) return false;

      if (/^0+$/.test(digitsOnly) || /^1+$/.test(digitsOnly)) return false;

      if (/^\d{4}$/.test(phone)) return false;

      return true;
    })
    .slice(0, 5);
}



export function extractSocialLinks($: CheerioAPI): Record<string, string> {
  const social: Record<string, string> = {};

  const platforms = [
    { name: 'facebook', domains: ['facebook.com', 'fb.com', 'fb.me'], excludePatterns: ['/sharer', '/plugins', '/share.php', '/dialog'] },
    { name: 'twitter', domains: ['twitter.com', 'x.com'], excludePatterns: ['/intent/', '/share'] },
    { name: 'linkedin', domains: ['linkedin.com', 'lnkd.in'], excludePatterns: ['/shareArticle', '/share', '/sharing/'] },
    { name: 'instagram', domains: ['instagram.com', 'instagr.am'], excludePatterns: ['/share'] },
    { name: 'youtube', domains: ['youtube.com', 'youtu.be'], excludePatterns: ['/redirect'] },
    { name: 'tiktok', domains: ['tiktok.com', 'vm.tiktok.com'], excludePatterns: [] },
    { name: 'pinterest', domains: ['pinterest.com', 'pin.it'], excludePatterns: ['/pin/create'] },
    { name: 'github', domains: ['github.com'], excludePatterns: [] },
    { name: 'medium', domains: ['medium.com'], excludePatterns: [] },
    { name: 'reddit', domains: ['reddit.com'], excludePatterns: ['/submit'] },
    { name: 'discord', domains: ['discord.gg', 'discord.com/invite'], excludePatterns: [] },
    { name: 'telegram', domains: ['t.me', 'telegram.me', 'telegram.org'], excludePatterns: [] },
    { name: 'whatsapp', domains: ['wa.me', 'whatsapp.com', 'chat.whatsapp.com'], excludePatterns: [] },
    { name: 'snapchat', domains: ['snapchat.com'], excludePatterns: [] },
    { name: 'twitch', domains: ['twitch.tv'], excludePatterns: [] },
    { name: 'threads', domains: ['threads.net'], excludePatterns: [] },
    { name: 'mastodon', domains: ['mastodon.social', 'fosstodon.org', 'mas.to'], excludePatterns: [] },
    { name: 'bluesky', domains: ['bsky.app', 'bsky.social'], excludePatterns: [] },
    { name: 'vimeo', domains: ['vimeo.com'], excludePatterns: [] },
    { name: 'behance', domains: ['behance.net'], excludePatterns: [] },
    { name: 'dribbble', domains: ['dribbble.com'], excludePatterns: [] },
    { name: 'spotify', domains: ['spotify.com', 'open.spotify.com'], excludePatterns: [] },
    { name: 'soundcloud', domains: ['soundcloud.com'], excludePatterns: [] },
    { name: 'slack', domains: ['slack.com'], excludePatterns: [] },
    { name: 'yelp', domains: ['yelp.com'], excludePatterns: [] },
    { name: 'tripadvisor', domains: ['tripadvisor.com'], excludePatterns: [] },
  ];

  for (const platform of platforms) {
    const selectors = platform.domains.map(domain => `a[href*="${domain}"]`).join(', ');

    $(selectors).each((_, el) => {
      if (social[platform.name]) return false;

      const href = $(el).attr('href');
      if (!href) return;

      const shouldExclude = platform.excludePatterns.some(pattern => href.includes(pattern));
      if (shouldExclude) return;

      try {
        const url = new URL(href.startsWith('http') ? href : `https://${href}`);
        if (platform.domains.some(domain => url.hostname.includes(domain))) {
          social[platform.name] = href.startsWith('http') ? href : `https://${href}`;
          return false;
        }
      } catch {
      }
    });
  }

  return social;
}



export function extractStructuredData($: CheerioAPI): Array<Record<string, unknown>> {
  const structuredData: Array<Record<string, unknown>> = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const content = $(el).html();
      

      if (content) {
        const data = JSON.parse(content);
        structuredData.push(data);
      }
    } catch {
    }
  });

  return structuredData;
}



export function extractMetaTag($: CheerioAPI, name: string): string | undefined {
  const selectors = [
    `meta[name="${name}"]`,
    `meta[property="${name}"]`,
    `meta[name="${name.toLowerCase()}"]`,
    `meta[property="${name.toLowerCase()}"]`,
  ];

  

  for (const selector of selectors) {
    const content = $(selector).attr('content');
    

    if (content) {
      return content;
    }
  }

  return undefined;
}



export function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\r\n\t]/g, ' ')
    .trim();
}



export function extractYear(text: string): number | undefined {
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  

  if (yearMatch) {
    const year = Number.parseInt(yearMatch[0], 10);
    const currentYear = new Date().getFullYear();
    

    if (year >= 1900 && year <= currentYear) {
      return year;
    }
  }
  return undefined;
}



export function extractAddress($: CheerioAPI): string | undefined {
  const addressSelectors = [
    '[itemtype*="PostalAddress"]',
    '[itemprop="address"]',
    '.address',
    '#address',
    '[class*="address"]',
    '[id*="address"]',
    '[class*="location"]',
    '[id*="location"]',
    '.contact-info address',
    'address',
  ];

  for (const selector of addressSelectors) {
    const el = $(selector).first();
    if (el.length) {
      const text = cleanText(el.text());
      if (text.length > 15 && text.length < 300) {
        return text;
      }
    }
  }

  const addressRegexes = [
    /\d+\s+[\w\s.]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|circle|cir|way|place|pl)(?:[\s,]+[\w\s.]+)*,?\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?/i,
    /\d+\s+[\w\s.'-]+(?:rue|avenue|boulevard|chemin|route|impasse|allée|place|square)\s+[\w\s.'-]+,?\s+\d{5}\s+[\w\s-]+/i,
    /\d+[-\s]?\d*\s+[\w\s.'-]+(?:straße|strasse|str\.|weg|platz|allee|gasse)\s*\d*,?\s+\d{5}\s+[\w\s-]+/i,
    /\d+[a-z]?\s+[\w\s.'-]+,\s+[\w\s]+,\s+[A-Z]{1,3}\s*\d{1,2}[A-Z]{0,2}\s+\d[A-Z]{2}/i,
    /\d{1,5}\s+[\w\s.'-]+,\s*(?:suite|ste|apt|unit|#)?\s*\d*,?\s*[\w\s]+,\s*[A-Z]{2}\s+\d{5}/i,
  ];

  const pageText = $('body').text();
  for (const regex of addressRegexes) {
    const match = pageText.match(regex);
    if (match) {
      const addr = cleanText(match[0]);
      if (addr.length > 15 && addr.length < 300) {
        return addr;
      }
    }
  }

  return undefined;
}



export function findAboutPage($: CheerioAPI, baseUrl: string): string | undefined {
  const aboutPatterns = ['/about', '/about-us', '/company', '/who-we-are', '/our-story', '/about-company', '/aboutus'];

  const links = $('a[href]');
  

  for (let i = 0; i < links.length; i++) {
    const href = $(links[i]).attr('href');
    

    if (!href) continue;

    const lowerHref = href.toLowerCase();
    

    for (const pattern of aboutPatterns) {
      

      if (lowerHref.includes(pattern)) {
        try {
          const url = new URL(href, baseUrl);
          return url.href;
        } catch {
          continue;
        }
      }
    }
  }

  return undefined;
}



export function findContactPage($: CheerioAPI, baseUrl: string): string | undefined {
  const contactPatterns = ['/contact', '/contact-us', '/get-in-touch', '/reach-us', '/contactus'];

  const links = $('a[href]');
  

  for (let i = 0; i < links.length; i++) {
    const href = $(links[i]).attr('href');
    

    if (!href) continue;

    const lowerHref = href.toLowerCase();
    

    for (const pattern of contactPatterns) {
      

      if (lowerHref.includes(pattern)) {
        try {
          const url = new URL(href, baseUrl);
          return url.href;
        } catch {
          continue;
        }
      }
    }
  }

  return undefined;
}



export function findTeamPage($: CheerioAPI, baseUrl: string): string | undefined {
  const teamPatterns = ['/team', '/our-team', '/people', '/meet-the-team', '/leadership', '/about/team'];

  const links = $('a[href]');
  for (let i = 0; i < links.length; i++) {
    const href = $(links[i]).attr('href');
    if (!href) continue;

    const lowerHref = href.toLowerCase();
    for (const pattern of teamPatterns) {
      if (lowerHref.includes(pattern)) {
        try {
          const url = new URL(href, baseUrl);
          return url.href;
        } catch {
          continue;
        }
      }
    }
  }

  return undefined;
}



export async function findSpeculativePaths(baseUrl: string, httpClient: any): Promise<Record<string, string>> {
  const paths = {
    about: ['/about', '/about-us', '/company', '/who-we-are', '/about.html', '/aboutus'],
    contact: ['/contact', '/contact-us', '/contactus', '/get-in-touch', '/contact.html'],
    team: ['/team', '/our-team', '/people', '/leadership', '/meet-the-team', '/about/team'],
    careers: ['/careers', '/jobs', '/join-us', '/work-with-us', '/opportunities'],
    services: ['/services', '/what-we-do', '/solutions'],
    pricing: ['/pricing', '/plans', '/packages'],
    blog: ['/blog', '/news', '/articles', '/insights'],
  };

  const found: Record<string, string> = {};
  const checks: Promise<void>[] = [];

  for (const [category, variants] of Object.entries(paths)) {
    for (const path of variants) {
      checks.push(
        (async () => {
          try {
            const url = new URL(path, baseUrl);
            const response = await httpClient.head(url.href);
            if (response && !found[category]) {
              found[category] = url.href;
            }
          } catch {
          }
        })()
      );
    }
  }

  await Promise.all(checks);
  return found;
}
