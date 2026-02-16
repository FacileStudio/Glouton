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
      let url = domain.trim().toLowerCase();
      if (!url.startsWith('http')) url = `https://${url}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) return null;

      const html = await response.text();
      if (!html) return null;

      const $ = load(html);

      console.info(
        `[SCRAPER] Found ${this.extractUnique(html, this.emailRegex).length} emails and ${this.extractUnique(html, this.phoneRegex).length} phones on ${url}`
      );
      return {
        title: $('title').text().substring(0, 200).trim(), // Cap length
        description: $('meta[name="description"]').attr('content')?.substring(0, 500).trim() || '',
        emails: this.extractUnique(html, this.emailRegex),
        phones: this.extractUnique(html, this.phoneRegex),
        socials: this.extractSocials($),
        technologies: this.detectTech(html, $),
        hasSsl: url.startsWith('https'),
      };
    } catch (e) {
      return null;
    }
  }

  private extractUnique(text: string, regex: RegExp): string[] {
    const matches = text.match(regex) || [];
    return [...new Set(matches.map((m) => m.toLowerCase()))]
      .filter((email) => !email.endsWith('.png') && !email.endsWith('.jpg'))
      .slice(0, 5);
  }

  private extractSocials($: any): AuditResult['socials'] {
    const socials: AuditResult['socials'] = {};
    const patterns = {
      facebook: 'facebook.com/',
      instagram: 'instagram.com/',
      linkedin: 'linkedin.com/company/',
      twitter: 'twitter.com/',
    };

    $('a[href]').each((_: any, el: any) => {
      const href = $(el).attr('href') || '';
      for (const [platform, pattern] of Object.entries(patterns)) {
        if (href.includes(pattern)) {
          socials[platform as keyof AuditResult['socials']] = href;
        }
      }
    });
    return socials;
  }

  private detectTech(html: string, $: any): string[] {
    const techs = new Set<string>();
    const htmlLower = html.toLowerCase();

    if (htmlLower.includes('wp-content')) techs.add('WordPress');
    if (htmlLower.includes('shopify.com')) techs.add('Shopify');
    if (htmlLower.includes('_next/static')) techs.add('Next.js');
    if (htmlLower.includes('googletagmanager.com')) techs.add('Google Tag Manager');
    if (htmlLower.includes('hubspot.com')) techs.add('HubSpot');
    if (htmlLower.includes('elementor')) techs.add('Elementor');

    return [...techs];
  }
}
