import { WebsiteAuditor, type AuditResult } from '../src/index';

interface Lead {
  url: string;
  companyName?: string;
  email?: string;
  phone?: string;
  technologies: string[];
  industry?: string;
  socialMedia: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
  };
  seoScore: {
    hasTitle: boolean;
    hasDescription: boolean;
    hasH1: boolean;
  };
  auditedAt: Date;
}

/**
 * extractLead
 */
async function extractLead(url: string): Promise<Lead> {
  const auditor = new WebsiteAuditor(30000, undefined, 3, 1000);

  auditor.setRateLimitConfig(5, 1000);

  const result: AuditResult = await auditor.audit(url, {
    includeTechnologies: true,
    includeSEO: true,
    includeCompanyInfo: true,
    includeSSL: true,
  });

  return {
    url: result.url,
    companyName: result.companyInfo?.name,
    email: result.companyInfo?.email,
    phone: result.companyInfo?.phone,
    technologies: result.technologies?.map((t) => t.name) || [],
    industry: result.companyInfo?.industry,
    socialMedia: {
      linkedin: result.companyInfo?.socialMedia?.linkedin,
      twitter: result.companyInfo?.socialMedia?.twitter,
      facebook: result.companyInfo?.socialMedia?.facebook,
    },
    seoScore: {
      hasTitle: !!result.seo?.title,
      hasDescription: !!result.seo?.description,
      hasH1: (result.seo?.h1Tags?.length || 0) > 0,
    },
    auditedAt: result.auditedAt,
  };
}

/**
 * leadExtractionExample
 */
async function leadExtractionExample() {
  console.log('Lead Extraction Example\n');

  const url = 'https://www.shopify.com';

  try {
    const lead = await extractLead(url);

    console.log('=== Lead Information ===');
    console.log(JSON.stringify(lead, null, 2));

    console.log('\n=== Lead Quality Score ===');
    let score = 0;
    const maxScore = 100;

    /**
     * if
     */
    if (lead.companyName) {
      score += 15;
      console.log('Company name found: +15');
    }
    /**
     * if
     */
    if (lead.email) {
      score += 25;
      console.log('Email found: +25');
    }
    /**
     * if
     */
    if (lead.phone) {
      score += 20;
      console.log('Phone found: +20');
    }
    /**
     * if
     */
    if (lead.technologies.length > 0) {
      score += 15;
      console.log(`Technologies found (${lead.technologies.length}): +15`);
    }
    /**
     * if
     */
    if (lead.socialMedia.linkedin || lead.socialMedia.twitter || lead.socialMedia.facebook) {
      score += 10;
      console.log('Social media found: +10');
    }
    /**
     * if
     */
    if (lead.industry) {
      score += 15;
      console.log('Industry identified: +15');
    }

    console.log(`\nTotal Score: ${score}/${maxScore}`);

    /**
     * if
     */
    if (score >= 70) {
      console.log('Quality: HIGH - Ready for outreach');
    } else if (score >= 40) {
      console.log('Quality: MEDIUM - Needs more research');
    } else {
      console.log('Quality: LOW - May not be worth pursuing');
    }
  } catch (error) {
    console.error('Error extracting lead:', error);
  }
}

/**
 * leadExtractionExample
 */
leadExtractionExample();
