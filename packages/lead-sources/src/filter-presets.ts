import type { LeadSourceFilters } from './types';

export interface FilterPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'agency' | 'saas' | 'ecommerce' | 'consulting' | 'other';
  targetAudience: string;
  filters: Omit<LeadSourceFilters, 'domain'>;
  cities?: string[];
  industries?: string[];
  years?: number[];
  headcounts?: string[];
}

export const FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'web-dev-agency',
    name: 'Web Development Agency',
    description: 'Target marketing agencies, design studios, and small businesses needing web development',
    icon: 'solar:code-bold',
    category: 'agency',
    targetAudience: 'Marketing agencies, design studios, PR firms, small businesses',
    cities: [
      'Paris',
      'Lyon',
      'Bordeaux',
      'Nantes',
      'Lille',
      'Marseille',
      'Toulouse',
      'Montpellier',
      'Rennes',
      'Strasbourg',
    ],
    industries: [
      'Marketing Services',
      'Advertising Services',
      'Design Services',
      'Public Relations and Communications Services',
    ],
    years: [2010, 2012, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023],
    headcounts: ['1-10', '11-50', '51-200'],
    filters: {
      type: 'personal',
      department: ['marketing', 'executive', 'management'],
      seniority: ['senior', 'executive'],
      jobTitles: ['CEO', 'CTO', 'Marketing Director', 'Creative Director', 'Founder'],
      verificationStatus: ['valid'],
    },
  },

  {
    id: 'design-agency',
    name: 'Design & Branding Agency',
    description: 'Target e-commerce brands, tech startups, and growing companies needing design work',
    icon: 'solar:palette-bold',
    category: 'agency',
    targetAudience: 'E-commerce brands, tech startups, SaaS companies, fashion brands',
    cities: [
      'San Francisco',
      'New York',
      'Los Angeles',
      'Austin',
      'Seattle',
      'Boston',
      'London',
      'Berlin',
      'Amsterdam',
      'Barcelona',
    ],
    industries: [
      'Software Development',
      'Retail',
      'E-commerce',
      'Fashion',
      'Consumer Goods',
      'Technology',
    ],
    years: [2018, 2019, 2020, 2021, 2022, 2023],
    headcounts: ['11-50', '51-200', '201-500'],
    filters: {
      type: 'personal',
      department: ['marketing', 'design', 'executive'],
      seniority: ['senior', 'executive'],
      jobTitles: ['CMO', 'Head of Marketing', 'Brand Manager', 'Creative Director', 'CEO'],
      verificationStatus: ['valid', 'accept_all'],
    },
  },

  {
    id: 'seo-agency',
    name: 'SEO & Content Marketing Agency',
    description: 'Target content-heavy businesses, publishers, and online retailers',
    icon: 'solar:chart-2-bold',
    category: 'agency',
    targetAudience: 'Publishers, blogs, e-commerce, SaaS, online education',
    cities: ['Remote', 'New York', 'London', 'Toronto', 'Sydney', 'Singapore', 'Dublin'],
    industries: [
      'Publishing',
      'E-commerce',
      'Software Development',
      'Education',
      'Media Production',
      'Online Media',
    ],
    years: [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023],
    headcounts: ['1-10', '11-50', '51-200'],
    filters: {
      type: 'personal',
      department: ['marketing', 'communication', 'executive'],
      seniority: ['senior', 'executive'],
      jobTitles: [
        'Marketing Director',
        'Content Manager',
        'SEO Manager',
        'Digital Marketing Manager',
        'CMO',
      ],
      verificationStatus: ['valid'],
    },
  },

  {
    id: 'saas-sales',
    name: 'SaaS Sales Outreach',
    description: 'Target companies likely to need your B2B SaaS product',
    icon: 'solar:cloud-bolt',
    category: 'saas',
    targetAudience: 'B2B companies, tech startups, growing businesses',
    cities: [
      'San Francisco',
      'New York',
      'Austin',
      'Seattle',
      'Boston',
      'Denver',
      'Chicago',
      'Toronto',
      'London',
      'Tel Aviv',
    ],
    industries: [
      'Technology',
      'Software Development',
      'IT Services',
      'Financial Services',
      'Professional Services',
    ],
    years: [2019, 2020, 2021, 2022, 2023],
    headcounts: ['11-50', '51-200', '201-500', '501-1000'],
    filters: {
      type: 'personal',
      department: ['sales', 'executive', 'it', 'operations'],
      seniority: ['senior', 'executive'],
      jobTitles: ['VP Sales', 'CTO', 'COO', 'Head of Operations', 'IT Director'],
      verificationStatus: ['valid'],
    },
  },

  {
    id: 'hr-software',
    name: 'HR Software Sales',
    description: 'Target HR departments in growing companies',
    icon: 'solar:users-group-rounded-bold',
    category: 'saas',
    targetAudience: 'Mid-size to large companies with HR departments',
    industries: [
      'Technology',
      'Manufacturing',
      'Retail',
      'Healthcare',
      'Financial Services',
      'Professional Services',
    ],
    headcounts: ['51-200', '201-500', '501-1000', '1001-5000'],
    filters: {
      type: 'personal',
      department: ['hr', 'executive', 'operations'],
      seniority: ['senior', 'executive'],
      jobTitles: ['HR Director', 'CHRO', 'People Operations', 'Talent Manager', 'VP HR'],
      verificationStatus: ['valid'],
    },
  },

  {
    id: 'ecommerce-agency',
    name: 'E-commerce Growth Agency',
    description: 'Target online stores and e-commerce brands for marketing services',
    icon: 'solar:cart-large-4-bold',
    category: 'agency',
    targetAudience: 'E-commerce stores, DTC brands, online retailers',
    industries: [
      'E-commerce',
      'Retail',
      'Consumer Goods',
      'Fashion',
      'Food & Beverage',
      'Beauty',
    ],
    years: [2018, 2019, 2020, 2021, 2022, 2023],
    headcounts: ['1-10', '11-50', '51-200'],
    filters: {
      type: 'personal',
      department: ['marketing', 'executive', 'sales'],
      seniority: ['senior', 'executive'],
      jobTitles: ['E-commerce Manager', 'CMO', 'Growth Manager', 'CEO', 'Founder'],
      verificationStatus: ['valid'],
    },
  },

  {
    id: 'social-media-agency',
    name: 'Social Media Management Agency',
    description: 'Target brands active on social media needing management services',
    icon: 'solar:hashtag-bold',
    category: 'agency',
    targetAudience: 'Consumer brands, influencers, lifestyle brands, restaurants',
    industries: [
      'Retail',
      'Fashion',
      'Beauty',
      'Food & Beverage',
      'Hospitality',
      'Entertainment',
      'Fitness',
    ],
    headcounts: ['1-10', '11-50', '51-200'],
    filters: {
      type: 'personal',
      department: ['marketing', 'communication', 'executive'],
      seniority: ['senior', 'executive'],
      jobTitles: [
        'Social Media Manager',
        'Marketing Director',
        'Brand Manager',
        'CMO',
        'Founder',
      ],
      verificationStatus: ['valid', 'accept_all'],
    },
  },

  {
    id: 'cybersecurity',
    name: 'Cybersecurity Solutions',
    description: 'Target companies needing security solutions',
    icon: 'solar:shield-check-bold',
    category: 'saas',
    targetAudience: 'Tech companies, financial services, healthcare, enterprises',
    industries: [
      'Technology',
      'Financial Services',
      'Healthcare',
      'Government',
      'Insurance',
      'Manufacturing',
    ],
    headcounts: ['51-200', '201-500', '501-1000', '1001-5000', '5001-10000'],
    filters: {
      type: 'personal',
      department: ['it', 'executive', 'operations'],
      seniority: ['senior', 'executive'],
      jobTitles: ['CISO', 'IT Director', 'Security Manager', 'CTO', 'CIO'],
      verificationStatus: ['valid'],
    },
  },

  {
    id: 'consulting-services',
    name: 'Business Consulting Services',
    description: 'Target companies needing strategic consulting',
    icon: 'solar:chart-square-bold',
    category: 'consulting',
    targetAudience: 'Growing businesses, scale-ups, traditional businesses digitizing',
    industries: [
      'Manufacturing',
      'Retail',
      'Healthcare',
      'Financial Services',
      'Professional Services',
      'Real Estate',
    ],
    years: [2000, 2005, 2010, 2015, 2018, 2019, 2020, 2021, 2022],
    headcounts: ['11-50', '51-200', '201-500', '501-1000'],
    filters: {
      type: 'personal',
      department: ['executive', 'operations', 'finance'],
      seniority: ['executive'],
      jobTitles: ['CEO', 'COO', 'CFO', 'Managing Director', 'President'],
      verificationStatus: ['valid'],
    },
  },

  {
    id: 'video-production',
    name: 'Video Production Agency',
    description: 'Target brands needing video content',
    icon: 'solar:videocamera-record-bold',
    category: 'agency',
    targetAudience: 'SaaS companies, e-commerce brands, tech startups, agencies',
    industries: [
      'Software Development',
      'E-commerce',
      'Marketing Services',
      'Technology',
      'Education',
      'Real Estate',
    ],
    headcounts: ['11-50', '51-200', '201-500'],
    filters: {
      type: 'personal',
      department: ['marketing', 'communication', 'executive'],
      seniority: ['senior', 'executive'],
      jobTitles: ['Marketing Director', 'Content Manager', 'CMO', 'Brand Manager', 'VP Marketing'],
      verificationStatus: ['valid'],
    },
  },

  {
    id: 'accounting-software',
    name: 'Accounting Software Sales',
    description: 'Target finance departments and small businesses',
    icon: 'solar:calculator-bold',
    category: 'saas',
    targetAudience: 'Small to mid-size businesses, accounting firms',
    industries: [
      'Accounting',
      'Professional Services',
      'Retail',
      'E-commerce',
      'Manufacturing',
      'Construction',
    ],
    headcounts: ['1-10', '11-50', '51-200', '201-500'],
    filters: {
      type: 'personal',
      department: ['finance', 'executive', 'operations'],
      seniority: ['senior', 'executive'],
      jobTitles: ['CFO', 'Controller', 'Finance Director', 'Accountant', 'CEO'],
      verificationStatus: ['valid'],
    },
  },

  {
    id: 'recruitment-agency',
    name: 'Recruitment & Staffing Agency',
    description: 'Target companies actively hiring',
    icon: 'solar:user-check-bold',
    category: 'consulting',
    targetAudience: 'Fast-growing companies, tech startups, enterprises',
    industries: [
      'Technology',
      'Software Development',
      'Healthcare',
      'Financial Services',
      'Manufacturing',
      'Retail',
    ],
    years: [2020, 2021, 2022, 2023],
    headcounts: ['11-50', '51-200', '201-500', '501-1000'],
    filters: {
      type: 'personal',
      department: ['hr', 'executive', 'operations'],
      seniority: ['senior', 'executive'],
      jobTitles: ['HR Manager', 'Talent Acquisition', 'CHRO', 'Recruiter', 'CEO'],
      verificationStatus: ['valid'],
    },
  },

  {
    id: 'legal-tech',
    name: 'Legal Tech Software',
    description: 'Target law firms and legal departments',
    icon: 'solar:scale-bold',
    category: 'saas',
    targetAudience: 'Law firms, corporate legal departments, legal services',
    industries: ['Legal Services', 'Financial Services', 'Insurance', 'Real Estate', 'Healthcare'],
    headcounts: ['11-50', '51-200', '201-500', '501-1000'],
    filters: {
      type: 'personal',
      department: ['legal', 'executive', 'operations'],
      seniority: ['senior', 'executive'],
      jobTitles: ['General Counsel', 'Legal Director', 'Partner', 'Managing Partner', 'CLO'],
      verificationStatus: ['valid'],
    },
  },

  {
    id: 'real-estate-services',
    name: 'Real Estate Services',
    description: 'Target real estate agencies and property management',
    icon: 'solar:home-angle-bold',
    category: 'other',
    targetAudience: 'Real estate agencies, property managers, commercial real estate',
    industries: ['Real Estate', 'Property Management', 'Construction', 'Architecture'],
    headcounts: ['1-10', '11-50', '51-200', '201-500'],
    filters: {
      type: 'personal',
      department: ['sales', 'executive', 'operations'],
      seniority: ['senior', 'executive'],
      jobTitles: ['Broker', 'Managing Director', 'CEO', 'Property Manager', 'VP Sales'],
      verificationStatus: ['valid', 'accept_all'],
    },
  },

  {
    id: 'hospitality-tech',
    name: 'Hospitality Tech Solutions',
    description: 'Target hotels, restaurants, and hospitality businesses',
    icon: 'solar:cup-hot-bold',
    category: 'saas',
    targetAudience: 'Hotels, restaurants, cafes, hospitality groups',
    industries: ['Hospitality', 'Food & Beverage', 'Travel', 'Tourism', 'Entertainment'],
    headcounts: ['1-10', '11-50', '51-200', '201-500'],
    filters: {
      type: 'personal',
      department: ['operations', 'executive', 'management'],
      seniority: ['senior', 'executive'],
      jobTitles: ['General Manager', 'Operations Manager', 'Owner', 'CEO', 'Director'],
      verificationStatus: ['valid', 'accept_all'],
    },
  },
];



export function getPresetsByCategory(category: FilterPreset['category']): FilterPreset[] {
  return FILTER_PRESETS.filter((p) => p.category === category);
}



export function getPresetById(id: string): FilterPreset | undefined {
  return FILTER_PRESETS.find((p) => p.id === id);
}



export function getAllCategories(): Array<{
  id: FilterPreset['category'];
  name: string;
  icon: string;
}> {
  return [
    { id: 'agency', name: 'Agency Services', icon: 'solar:case-round-bold' },
    { id: 'saas', name: 'SaaS Products', icon: 'solar:cloud-bold' },
    { id: 'consulting', name: 'Consulting', icon: 'solar:graph-new-bold' },
    { id: 'ecommerce', name: 'E-commerce', icon: 'solar:cart-large-4-bold' },
    { id: 'other', name: 'Other Services', icon: 'solar:widget-bold' },
  ];
}



export function searchPresets(query: string): FilterPreset[] {
  const lowerQuery = query.toLowerCase();
  return FILTER_PRESETS.filter(
    (p) =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.description.toLowerCase().includes(lowerQuery) ||
      p.targetAudience.toLowerCase().includes(lowerQuery),
  );
}
