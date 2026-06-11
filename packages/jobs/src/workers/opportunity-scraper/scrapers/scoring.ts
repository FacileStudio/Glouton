const HOT = [
  'sveltekit', 'svelte', 'golang', 'go backend', 'go developer', 'go lang',
  'tailwindcss', 'tailwind css', 'tailwind',
  'web design', 'webdesign', 'web designer', 'designer web',
  'site vitrine', 'création de site', 'refonte site', 'site sur mesure',
  'branding', 'identité visuelle', 'charte graphique',
  'ui/ux', 'ui design', 'ux design', 'design system',
  'figma', 'landing page', 'one page',
];

const WARM = [
  'typescript', 'next.js', 'nextjs', 'react',
  'node.js', 'nodejs', 'node ',
  'frontend', 'front-end', 'front end',
  'fullstack', 'full-stack', 'full stack',
  'rest api', 'graphql', 'api rest',
  'postgresql', 'postgres', 'docker',
  'website', 'web app', 'web application',
  'développeur web', 'dev web', 'développement web',
  'web development', 'web developer',
];

const COLD = [
  'javascript', 'html', 'css', 'php', 'wordpress',
  'freelance', 'remote', 'télétravail', 'full remote',
  'digital', 'logiciel', 'software', 'web',
];

const NEGATIVE = [
  'java ', ' .net', 'c# ', 'c++ ', 'c/c++',
  'unity', 'unreal engine',
  'android native', 'ios native', 'swift ', 'kotlin ',
  'ruby on rails', ' rails',
  'angular ', 'angularjs',
  'machine learning', 'data science', 'big data', 'deep learning',
  'embedded', 'firmware',
  'sap ', 'oracle ', 'salesforce',
  'cobol', 'fortran', 'perl ',
];

function countMatches(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) count++;
  }
  return count;
}

export function scoreOpportunity(title: string, description: string, isRemote: boolean, budgetMin?: number): number {
  const text = `${title} ${description}`;

  const hot = countMatches(text, HOT);
  const warm = countMatches(text, WARM);
  const cold = countMatches(text, COLD);
  const neg = countMatches(text, NEGATIVE);

  let score = 0;
  score += Math.min(hot, 4) * 18;
  score += Math.min(warm, 4) * 8;
  score += Math.min(cold, 3) * 3;
  score -= neg * 20;
  if (isRemote) score += 5;
  if (budgetMin && budgetMin >= 400) score += 10;

  return Math.max(0, Math.min(100, score));
}

export function tierFromScore(score: number): 'HOT' | 'WARM' | 'COLD' {
  if (score >= 55) return 'HOT';
  if (score >= 25) return 'WARM';
  return 'COLD';
}

export function detectCategory(title: string, description: string): string {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes('design') && (text.includes('ui') || text.includes('ux') || text.includes('figma'))) return 'UI_UX_DESIGN';
  if (text.includes('web design') || text.includes('webdesign') || text.includes('graphi')) return 'WEB_DESIGN';
  if (text.includes('frontend') || text.includes('front-end') || text.includes('react') || text.includes('svelte') || text.includes('vue')) return 'FRONTEND';
  if (text.includes('backend') || text.includes('back-end') || text.includes('api') || text.includes('golang') || text.includes('node')) return 'BACKEND';
  if (text.includes('fullstack') || text.includes('full-stack') || text.includes('full stack')) return 'FULLSTACK';
  if (text.includes('wordpress') || text.includes('woocommerce')) return 'WORDPRESS';
  if (text.includes('ecommerce') || text.includes('e-commerce') || text.includes('shopify')) return 'ECOMMERCE';
  if (text.includes('mobile') || text.includes('ios') || text.includes('android') || text.includes('flutter')) return 'MOBILE_DEVELOPMENT';
  if (text.includes('devops') || text.includes('docker') || text.includes('kubernetes') || text.includes('cloud')) return 'DEVOPS';
  return 'WEB_DEVELOPMENT';
}
