import { load } from 'cheerio';

export interface AuditResult {
  title: string;
  description: string;
  emails: string[];
  phones: string[];
  socials: {
    facebook?: string;
    instagram?: string;
    linkedin?: string;
    twitter?: string;
  };
  technologies: string[];
  hasSsl: boolean;
}

export class ScraperService {
  private emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  private phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

  async auditDomain(domain: string): Promise<AuditResult | null> {
    try {
      const startTime = Date.now();
      const url = domain.startsWith('http') ? domain : `https://${domain}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,xml;q=0.9',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return null;

      const html = await response.text();
      const $ = load(html);

      const result = {
        title: $('title').text().trim(),
        description: $('meta[name="description"]').attr('content')?.trim() || '',
        emails: this.extractUnique(html, this.emailRegex),
        phones: this.extractUnique(html, this.phoneRegex),
        socials: this.extractSocials($),
        technologies: this.detectTech(html, $),
        hasSsl: url.startsWith('https'),
      };
      console.log(
        `[SCRAPER] Found ${result.emails.length} emails, ${result.phones.length} phones, ${Object.keys(result.socials).length} socials, ${result.technologies.length} technologies for ${domain}`
      );
      return result;
    } catch (e) {
      console.log(`[SCRAPER] Error auditing ${domain}:`);
      return null;
    }
  }

  private extractUnique(text: string, regex: RegExp): string[] {
    const matches = text.match(regex) || [];
    return [...new Set(matches.map((m) => m.toLowerCase()))].slice(0, 5);
  }

  private extractSocials($: any): AuditResult['socials'] {
    const socials: AuditResult['socials'] = {};
    $('a[href]').each((_: any, el: any) => {
      const href = $(el).attr('href') || '';
      if (href.includes('facebook.com/')) socials.facebook = href;
      if (href.includes('instagram.com/')) socials.instagram = href;
      if (href.includes('linkedin.com/company/')) socials.linkedin = href;
      if (href.includes('twitter.com/') || href.includes('x.com/')) socials.twitter = href;
    });
    return socials;
  }

  private detectTech(html: string, $: any): string[] {
    const techs = new Set<string>();
    if (html.includes('wp-content')) techs.add('WordPress');
    if (html.includes('shopify.com')) techs.add('Shopify');
    if ($('script[src*="next"]').length) techs.add('Next.js');
    if (html.includes('googletagmanager.com')) techs.add('Google Tag Manager');
    if (html.includes('hubspot.com')) techs.add('HubSpot');
    return [...techs];
  }
}
