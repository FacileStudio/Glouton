import type { CheerioAPI } from 'cheerio';
import type { Technology } from '../types';

interface TechnologyPattern {
  name: string;
  category: string;
  patterns: {
    html?: RegExp[];
    script?: RegExp[];
    meta?: RegExp[];
    headers?: Record<string, RegExp>;
    cookies?: string[];
  };
  website?: string;
}

const TECHNOLOGY_PATTERNS: TechnologyPattern[] = [
  {
    name: 'WordPress',
    category: 'CMS',
    website: 'https://wordpress.org',
    patterns: {
      html: [/wp-content/i, /wp-includes/i],
      meta: [/wordpress/i],
    },
  },
  {
    name: 'Shopify',
    category: 'E-commerce',
    website: 'https://shopify.com',
    patterns: {
      html: [/cdn\.shopify\.com/i, /shopify/i],
      headers: {
        'x-shopify-stage': /.*/,
      },
    },
  },
  {
    name: 'WooCommerce',
    category: 'E-commerce',
    website: 'https://woocommerce.com',
    patterns: {
      html: [/woocommerce/i],
      script: [/wc-/i],
    },
  },
  {
    name: 'Magento',
    category: 'E-commerce',
    website: 'https://magento.com',
    patterns: {
      html: [/Mage\.Cookies/i],
      script: [/mage/i],
      cookies: ['frontend'],
    },
  },
  {
    name: 'React',
    category: 'JavaScript Framework',
    website: 'https://reactjs.org',
    patterns: {
      html: [/react/i, /__react/i, /data-reactroot/i, /data-reactid/i],
      script: [/react\..*\.js/i, /react-dom/i],
    },
  },
  {
    name: 'Vue.js',
    category: 'JavaScript Framework',
    website: 'https://vuejs.org',
    patterns: {
      html: [/vue/i, /data-v-/i, /v-cloak/i],
      script: [/vue\..*\.js/i],
    },
  },
  {
    name: 'Angular',
    category: 'JavaScript Framework',
    website: 'https://angular.io',
    patterns: {
      html: [/ng-/i, /data-ng-/i],
      script: [/angular\..*\.js/i],
    },
  },
  {
    name: 'Next.js',
    category: 'JavaScript Framework',
    website: 'https://nextjs.org',
    patterns: {
      html: [/__next/i, /_next/i],
      script: [/_next\/static/i],
    },
  },
  {
    name: 'Nuxt.js',
    category: 'JavaScript Framework',
    website: 'https://nuxtjs.org',
    patterns: {
      html: [/__nuxt/i],
      script: [/_nuxt/i],
    },
  },
  {
    name: 'Svelte',
    category: 'JavaScript Framework',
    website: 'https://svelte.dev',
    patterns: {
      html: [/svelte/i],
      script: [/svelte/i],
    },
  },
  {
    name: 'jQuery',
    category: 'JavaScript Library',
    website: 'https://jquery.com',
    patterns: {
      script: [/jquery[.-]/i],
    },
  },
  {
    name: 'Bootstrap',
    category: 'CSS Framework',
    website: 'https://getbootstrap.com',
    patterns: {
      html: [/bootstrap/i],
      script: [/bootstrap/i],
    },
  },
  {
    name: 'Tailwind CSS',
    category: 'CSS Framework',
    website: 'https://tailwindcss.com',
    patterns: {
      html: [/tailwind/i],
    },
  },
  {
    name: 'Google Analytics',
    category: 'Analytics',
    website: 'https://analytics.google.com',
    patterns: {
      script: [/google-analytics\.com\/analytics\.js/i, /googletagmanager\.com\/gtag/i],
      html: [/UA-\d+-\d+/i, /G-[A-Z0-9]+/i],
    },
  },
  {
    name: 'Google Tag Manager',
    category: 'Tag Manager',
    website: 'https://tagmanager.google.com',
    patterns: {
      script: [/googletagmanager\.com\/gtm\.js/i],
      html: [/GTM-[A-Z0-9]+/i],
    },
  },
  {
    name: 'Facebook Pixel',
    category: 'Analytics',
    website: 'https://facebook.com',
    patterns: {
      script: [/connect\.facebook\.net/i, /fbevents\.js/i],
    },
  },
  {
    name: 'Hotjar',
    category: 'Analytics',
    website: 'https://hotjar.com',
    patterns: {
      script: [/static\.hotjar\.com/i],
    },
  },
  {
    name: 'Stripe',
    category: 'Payment Processor',
    website: 'https://stripe.com',
    patterns: {
      script: [/js\.stripe\.com/i],
    },
  },
  {
    name: 'PayPal',
    category: 'Payment Processor',
    website: 'https://paypal.com',
    patterns: {
      script: [/paypal/i],
      html: [/paypal/i],
    },
  },
  {
    name: 'Cloudflare',
    category: 'CDN',
    website: 'https://cloudflare.com',
    patterns: {
      headers: {
        server: /cloudflare/i,
        'cf-ray': /.*/,
      },
    },
  },
  {
    name: 'Amazon CloudFront',
    category: 'CDN',
    website: 'https://aws.amazon.com/cloudfront',
    patterns: {
      headers: {
        'x-amz-cf-id': /.*/,
        via: /cloudfront/i,
      },
    },
  },
  {
    name: 'Nginx',
    category: 'Web Server',
    website: 'https://nginx.org',
    patterns: {
      headers: {
        server: /nginx/i,
      },
    },
  },
  {
    name: 'Apache',
    category: 'Web Server',
    website: 'https://apache.org',
    patterns: {
      headers: {
        server: /apache/i,
      },
    },
  },
  {
    name: 'Vercel',
    category: 'Hosting',
    website: 'https://vercel.com',
    patterns: {
      headers: {
        server: /vercel/i,
        'x-vercel-id': /.*/,
      },
    },
  },
  {
    name: 'Netlify',
    category: 'Hosting',
    website: 'https://netlify.com',
    patterns: {
      headers: {
        server: /netlify/i,
        'x-nf-request-id': /.*/,
      },
    },
  },
  {
    name: 'Webflow',
    category: 'Website Builder',
    website: 'https://webflow.com',
    patterns: {
      html: [/webflow/i],
      meta: [/webflow/i],
    },
  },
  {
    name: 'Wix',
    category: 'Website Builder',
    website: 'https://wix.com',
    patterns: {
      html: [/wix\.com/i],
      headers: {
        'x-wix-request-id': /.*/,
      },
    },
  },
  {
    name: 'Squarespace',
    category: 'Website Builder',
    website: 'https://squarespace.com',
    patterns: {
      html: [/squarespace/i],
      meta: [/squarespace/i],
    },
  },
  {
    name: 'Drupal',
    category: 'CMS',
    website: 'https://drupal.org',
    patterns: {
      html: [/drupal/i],
      headers: {
        'x-drupal-cache': /.*/,
        'x-generator': /drupal/i,
      },
    },
  },
  {
    name: 'Joomla',
    category: 'CMS',
    website: 'https://joomla.org',
    patterns: {
      html: [/joomla/i],
      meta: [/joomla/i],
    },
  },
  {
    name: 'HubSpot',
    category: 'Marketing Automation',
    website: 'https://hubspot.com',
    patterns: {
      script: [/js\.hs-scripts\.com/i, /hubspot/i],
    },
  },
  {
    name: 'Mailchimp',
    category: 'Email Marketing',
    website: 'https://mailchimp.com',
    patterns: {
      script: [/mailchimp/i],
      html: [/mailchimp/i],
    },
  },
  {
    name: 'Intercom',
    category: 'Customer Support',
    website: 'https://intercom.com',
    patterns: {
      script: [/widget\.intercom\.io/i],
    },
  },
  {
    name: 'Zendesk',
    category: 'Customer Support',
    website: 'https://zendesk.com',
    patterns: {
      script: [/zendesk/i],
    },
  },
];

/**
 * detectTechnologies
 */
export async function detectTechnologies(
  $: CheerioAPI,
  html: string,
  headers: Record<string, string>
): Promise<Technology[]> {
  const technologies: Technology[] = [];
  const detectedNames = new Set<string>();

  /**
   * for
   */
  for (const pattern of TECHNOLOGY_PATTERNS) {
    /**
     * if
     */
    if (detectedNames.has(pattern.name)) {
      continue;
    }

    let detected = false;
    let confidence = 0;
    let version: string | undefined;

    /**
     * if
     */
    if (pattern.patterns.html) {
      /**
       * for
       */
      for (const regex of pattern.patterns.html) {
        /**
         * if
         */
        if (regex.test(html)) {
          detected = true;
          confidence += 30;
          break;
        }
      }
    }

    /**
     * if
     */
    if (pattern.patterns.script && pattern.patterns.script.length > 0) {
      $('script').each((_, el) => {
        const src = $(el).attr('src') || '';
        const content = $(el).html() || '';
        const scriptText = src + ' ' + content;

        /**
         * for
         */
        for (const regex of pattern.patterns.script!) {
          /**
           * if
           */
          if (regex.test(scriptText)) {
            detected = true;
            confidence += 40;

            const versionMatch = scriptText.match(/(\d+\.\d+\.\d+)/);
            /**
             * if
             */
            if (versionMatch && !version) {
              version = versionMatch[1];
            }
            return false;
          }
        }
      });
    }

    /**
     * if
     */
    if (pattern.patterns.meta && pattern.patterns.meta.length > 0) {
      $('meta').each((_, el) => {
        const name = $(el).attr('name') || '';
        const content = $(el).attr('content') || '';
        const metaText = name + ' ' + content;

        /**
         * for
         */
        for (const regex of pattern.patterns.meta!) {
          /**
           * if
           */
          if (regex.test(metaText)) {
            detected = true;
            confidence += 30;
            return false;
          }
        }
      });
    }

    /**
     * if
     */
    if (pattern.patterns.headers) {
      /**
       * for
       */
      for (const [headerName, headerRegex] of Object.entries(pattern.patterns.headers)) {
        const headerValue = headers[headerName.toLowerCase()] || '';
        /**
         * if
         */
        if (headerRegex.test(headerValue)) {
          detected = true;
          confidence += 50;

          const versionMatch = headerValue.match(/(\d+\.\d+\.\d+)/);
          /**
           * if
           */
          if (versionMatch && !version) {
            version = versionMatch[1];
          }
          break;
        }
      }
    }

    /**
     * if
     */
    if (detected) {
      detectedNames.add(pattern.name);
      technologies.push({
        name: pattern.name,
        category: pattern.category,
        confidence: Math.min(confidence, 100),
        version,
        website: pattern.website,
      });
    }
  }

  return technologies.sort((a, b) => b.confidence - a.confidence);
}

/**
 * extractVersion
 */
export function extractVersion(text: string, technology: string): string | undefined {
  const patterns = [
    new RegExp(`${technology}[\\s\\/]*(\\d+\\.\\d+\\.\\d+)`, 'i'),
    new RegExp(`${technology}[\\s\\/]*(\\d+\\.\\d+)`, 'i'),
    /version[:\s]*([\d.]+)/i,
    /v([\d.]+)/i,
  ];

  /**
   * for
   */
  for (const pattern of patterns) {
    const match = text.match(pattern);
    /**
     * if
     */
    if (match && match[1]) {
      return match[1];
    }
  }

  return undefined;
}
