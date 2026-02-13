import type { JobDefinition } from '../types';
import type { PrismaClient, LeadStatus } from '@repo/database';

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const hostname = parsed.hostname;
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname)) return false;
    if (hostname.startsWith('192.168.') || hostname.startsWith('10.')) return false;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export interface LeadExtractionJobData {
  huntSessionId: string;
  userId: string;
  targetUrl: string;
  speed: number;
}

export interface LeadExtractionResult {
  huntSessionId: string;
  totalLeads: number;
  successfulLeads: number;
  failedLeads: number;
}

interface LeadData {
  domain: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  technologies: string[];
  status: LeadStatus;
  score: number;
}

async function fetchWithTimeout(url: string, timeoutMs: number = 30000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GloutonBot/1.0)',
      },
    });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

async function extractLeadsFromUrl(
  url: string,
  speed: number,
  onProgress: (progress: number) => Promise<void>
): Promise<LeadData[]> {
  const leads: LeadData[] = [];

  const baseDelay = Math.max(100, 1000 / speed);

  await onProgress(10);

  try {
    const domain = new URL(url).hostname;

    await new Promise(resolve => setTimeout(resolve, baseDelay * 2));
    await onProgress(30);

    const detectedTechs = await detectTechnologies(url);
    await onProgress(50);

    const contactEmails = await extractContactEmails(url, baseDelay);
    await onProgress(70);

    for (const emailData of contactEmails) {
      const score = calculateLeadScore(emailData, detectedTechs);
      const status = determineLeadStatus(score);

      leads.push({
        domain,
        email: emailData.email,
        firstName: emailData.firstName,
        lastName: emailData.lastName,
        technologies: detectedTechs,
        status,
        score,
      });
    }

    await onProgress(90);

  } catch (error) {
    console.error('Lead extraction error:', error);
  }

  await onProgress(100);

  return leads;
}

async function detectTechnologies(url: string): Promise<string[]> {
  const technologies: string[] = [];

  try {
    const response = await fetchWithTimeout(url);

    const html = await response.text();
    const headers = response.headers;

    if (html.includes('react')) technologies.push('React');
    if (html.includes('vue')) technologies.push('Vue');
    if (html.includes('angular')) technologies.push('Angular');
    if (html.includes('svelte')) technologies.push('Svelte');
    if (html.includes('next')) technologies.push('Next.js');
    if (html.includes('nuxt')) technologies.push('Nuxt');

    if (html.includes('wordpress') || html.includes('wp-content')) {
      technologies.push('WordPress');
    }
    if (html.includes('shopify')) technologies.push('Shopify');
    if (html.includes('wix')) technologies.push('Wix');

    const serverHeader = headers.get('server');
    if (serverHeader) {
      if (serverHeader.includes('nginx')) technologies.push('Nginx');
      if (serverHeader.includes('Apache')) technologies.push('Apache');
      if (serverHeader.includes('cloudflare')) technologies.push('Cloudflare');
    }

    if (headers.get('x-powered-by')?.includes('PHP')) {
      technologies.push('PHP');
    }

  } catch (error) {
    console.error('Technology detection error:', error);
  }

  return technologies;
}

async function extractContactEmails(url: string, delay: number): Promise<Array<{ email: string; firstName?: string; lastName?: string }>> {
  const contacts: Array<{ email: string; firstName?: string; lastName?: string }> = [];

  try {
    const response = await fetchWithTimeout(url);

    const html = await response.text();

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emailMatches = html.match(emailRegex) || [];

    const uniqueEmails = [...new Set(emailMatches)].filter(email => {
      return !email.includes('example.com') &&
             !email.includes('test.com') &&
             !email.includes('localhost');
    });

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      const contactResponse = await fetchWithTimeout(`${url}/contact`);

      if (contactResponse.ok) {
        const contactHtml = await contactResponse.text();
        const contactEmails = contactHtml.match(emailRegex) || [];
        uniqueEmails.push(...contactEmails);
      }
    } catch {}

    const finalUniqueEmails = [...new Set(uniqueEmails)];

    for (const email of finalUniqueEmails) {
      const nameParts = email.split('@')[0].split(/[._-]/);
      contacts.push({
        email,
        firstName: nameParts[0] ? capitalize(nameParts[0]) : undefined,
        lastName: nameParts[1] ? capitalize(nameParts[1]) : undefined,
      });
    }

  } catch (error) {
    console.error('Email extraction error:', error);
  }

  return contacts;
}

function calculateLeadScore(
  contact: { email: string; firstName?: string; lastName?: string },
  technologies: string[]
): number {
  let score = 50;

  if (contact.email.includes('contact') || contact.email.includes('info')) {
    score += 10;
  }
  if (contact.email.includes('sales') || contact.email.includes('business')) {
    score += 20;
  }
  if (contact.email.includes('admin') || contact.email.includes('support')) {
    score -= 10;
  }

  if (contact.firstName && contact.lastName) {
    score += 15;
  }

  score += Math.min(technologies.length * 5, 25);

  return Math.max(0, Math.min(100, score));
}

function determineLeadStatus(score: number): LeadStatus {
  if (score >= 75) return 'HOT';
  if (score >= 50) return 'WARM';
  return 'COLD';
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export const createLeadExtractionJob = (
  db: PrismaClient
): JobDefinition<LeadExtractionJobData, LeadExtractionResult> => ({
  name: 'lead-extraction',
  processor: async (job) => {
    const { huntSessionId, userId, targetUrl, speed } = job.data;

    if (!isValidUrl(targetUrl)) {
      throw new Error('Invalid or disallowed URL');
    }

    if (speed <= 0 || speed > 10) {
      throw new Error('Speed must be between 1 and 10');
    }

    try {
      await db.huntSession.update({
        where: { id: huntSessionId },
        data: {
          status: 'PROCESSING',
          startedAt: new Date(),
        },
      });

      const leads = await extractLeadsFromUrl(
        targetUrl,
        speed,
        async (progress) => {
          await job.updateProgress(progress);
          await db.huntSession.update({
            where: { id: huntSessionId },
            data: { progress },
          });
        }
      );

      let successfulLeads = 0;
      let failedLeads = 0;

      for (const leadData of leads) {
        try {
          await db.lead.create({
            data: {
              userId,
              huntSessionId,
              domain: leadData.domain,
              email: leadData.email,
              firstName: leadData.firstName,
              lastName: leadData.lastName,
              technologies: leadData.technologies,
              status: leadData.status,
              score: leadData.score,
            },
          });
          successfulLeads++;
        } catch (error) {
          console.error('Failed to create lead:', error);
          failedLeads++;
        }
      }

      await db.huntSession.update({
        where: { id: huntSessionId },
        data: {
          status: 'COMPLETED',
          progress: 100,
          totalLeads: leads.length,
          successfulLeads,
          failedLeads,
          completedAt: new Date(),
        },
      });

      return {
        huntSessionId,
        totalLeads: leads.length,
        successfulLeads,
        failedLeads,
      };

    } catch (error) {
      await db.huntSession.update({
        where: { id: huntSessionId },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown error',
          completedAt: new Date(),
        },
      });

      throw error;
    }
  },
  options: {
    concurrency: 3,
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});
