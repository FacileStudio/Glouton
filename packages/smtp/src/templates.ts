import type { EmailTemplate } from './types';

export const emailTemplates: Record<string, EmailTemplate> = {
  problemSolution: {
    id: 'problemSolution',
    name: 'Problème-Solution (PAS)',
    subject: '{{companyName}} - {{problem}}',
    variables: ['recipientName', 'companyName', 'yourName', 'problem', 'solution', 'metric'],
    generateHtml: (vars) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    p { margin-bottom: 1em; }
  </style>
</head>
<body>
  <p>Bonjour ${vars.recipientName},</p>

  <p>J'ai remarqué que ${vars.companyName} ${vars.problem}.</p>

  <p>Nous avons aidé des entreprises similaires à ${vars.solution} – résultat : ${vars.metric}.</p>

  <p>10 minutes pour en discuter ?</p>

  <p>${vars.yourName}</p>
</body>
</html>`,
    generateText: (vars) => `Bonjour ${vars.recipientName},

J'ai remarqué que ${vars.companyName} ${vars.problem}.

Nous avons aidé des entreprises similaires à ${vars.solution} – résultat : ${vars.metric}.

10 minutes pour en discuter ?

${vars.yourName}`,
  },

  question: {
    id: 'question',
    name: 'Question Curieuse',
    subject: 'Question sur {{companyName}}',
    variables: ['recipientName', 'companyName', 'yourName', 'question', 'context'],
    generateHtml: (vars) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    p { margin-bottom: 1em; }
  </style>
</head>
<body>
  <p>Bonjour ${vars.recipientName},</p>

  <p>${vars.question}</p>

  <p>Je demande car ${vars.context}.</p>

  <p>${vars.yourName}</p>
</body>
</html>`,
    generateText: (vars) => `Bonjour ${vars.recipientName},

${vars.question}

Je demande car ${vars.context}.

${vars.yourName}`,
  },

  socialProof: {
    id: 'socialProof',
    name: 'Preuve Sociale',
    subject: '{{similarCompany}} a fait {{metric}}',
    variables: ['recipientName', 'companyName', 'yourName', 'similarCompany', 'result', 'metric'],
    generateHtml: (vars) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    p { margin-bottom: 1em; }
  </style>
</head>
<body>
  <p>Bonjour ${vars.recipientName},</p>

  <p>${vars.similarCompany} a récemment ${vars.result} – ${vars.metric}.</p>

  <p>Ça pourrait intéresser ${vars.companyName} ?</p>

  <p>${vars.yourName}</p>
</body>
</html>`,
    generateText: (vars) => `Bonjour ${vars.recipientName},

${vars.similarCompany} a récemment ${vars.result} – ${vars.metric}.

Ça pourrait intéresser ${vars.companyName} ?

${vars.yourName}`,
  },

  valueFirst: {
    id: 'valueFirst',
    name: 'Valeur d\'Abord',
    subject: 'Ressource pour {{companyName}}',
    variables: ['recipientName', 'companyName', 'yourName', 'resource', 'benefit'],
    generateHtml: (vars) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    p { margin-bottom: 1em; }
  </style>
</head>
<body>
  <p>Bonjour ${vars.recipientName},</p>

  <p>J'ai créé ${vars.resource} pour ${vars.benefit}. Je pense que ça pourrait aider ${vars.companyName}.</p>

  <p>C'est gratuit – intéressé ?</p>

  <p>${vars.yourName}</p>
</body>
</html>`,
    generateText: (vars) => `Bonjour ${vars.recipientName},

J'ai créé ${vars.resource} pour ${vars.benefit}. Je pense que ça pourrait aider ${vars.companyName}.

C'est gratuit – intéressé ?

${vars.yourName}`,
  },

  followUp: {
    id: 'followUp',
    name: 'Relance Douce',
    subject: 'Re: {{originalSubject}}',
    variables: ['recipientName', 'yourName', 'originalSubject'],
    generateHtml: (vars) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    p { margin-bottom: 1em; }
  </style>
</head>
<body>
  <p>Bonjour ${vars.recipientName},</p>

  <p>Mauvais moment ?</p>

  <p>Dites-moi si vous préférez qu'on en parle plus tard.</p>

  <p>${vars.yourName}</p>
</body>
</html>`,
    generateText: (vars) => `Bonjour ${vars.recipientName},

Mauvais moment ?

Dites-moi si vous préférez qu'on en parle plus tard.

${vars.yourName}`,
  },

  brokenProcess: {
    id: 'brokenProcess',
    name: 'Processus Cassé',
    subject: '{{companyName}} - {{process}}',
    variables: ['recipientName', 'companyName', 'yourName', 'process', 'issue', 'timeframe'],
    generateHtml: (vars) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    p { margin-bottom: 1em; }
  </style>
</head>
<body>
  <p>Bonjour ${vars.recipientName},</p>

  <p>J'ai remarqué que ${vars.companyName} ${vars.issue} au niveau du ${vars.process}.</p>

  <p>On a résolu ça pour plusieurs entreprises en ${vars.timeframe}. Intéressé ?</p>

  <p>${vars.yourName}</p>
</body>
</html>`,
    generateText: (vars) => `Bonjour ${vars.recipientName},

J'ai remarqué que ${vars.companyName} ${vars.issue} au niveau du ${vars.process}.

On a résolu ça pour plusieurs entreprises en ${vars.timeframe}. Intéressé ?

${vars.yourName}`,
  },

  recentEvent: {
    id: 'recentEvent',
    name: 'Événement Récent',
    subject: 'Félicitations pour {{event}}',
    variables: ['recipientName', 'companyName', 'yourName', 'event', 'relevance'],
    generateHtml: (vars) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    p { margin-bottom: 1em; }
  </style>
</head>
<body>
  <p>Bonjour ${vars.recipientName},</p>

  <p>J'ai vu que ${vars.companyName} ${vars.event} – félicitations !</p>

  <p>${vars.relevance}</p>

  <p>10 minutes pour en parler ?</p>

  <p>${vars.yourName}</p>
</body>
</html>`,
    generateText: (vars) => `Bonjour ${vars.recipientName},

J'ai vu que ${vars.companyName} ${vars.event} – félicitations !

${vars.relevance}

10 minutes pour en parler ?

${vars.yourName}`,
  },

  directValue: {
    id: 'directValue',
    name: 'Valeur Directe',
    subject: '{{specificMetric}} pour {{companyName}}',
    variables: ['recipientName', 'companyName', 'yourName', 'specificMetric', 'howWeDoIt'],
    generateHtml: (vars) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    p { margin-bottom: 1em; }
  </style>
</head>
<body>
  <p>Bonjour ${vars.recipientName},</p>

  <p>On aide des entreprises comme ${vars.companyName} à obtenir ${vars.specificMetric}.</p>

  <p>Notre approche : ${vars.howWeDoIt}</p>

  <p>Ça vous parle ?</p>

  <p>${vars.yourName}</p>
</body>
</html>`,
    generateText: (vars) => `Bonjour ${vars.recipientName},

On aide des entreprises comme ${vars.companyName} à obtenir ${vars.specificMetric}.

Notre approche : ${vars.howWeDoIt}

Ça vous parle ?

${vars.yourName}`,
  },

  industryTrend: {
    id: 'industryTrend',
    name: 'Tendance du Secteur',
    subject: '{{trend}} dans votre secteur',
    variables: ['recipientName', 'companyName', 'yourName', 'trend', 'implication'],
    generateHtml: (vars) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    p { margin-bottom: 1em; }
  </style>
</head>
<body>
  <p>Bonjour ${vars.recipientName},</p>

  <p>Avec ${vars.trend}, beaucoup d'entreprises dans votre secteur ${vars.implication}.</p>

  <p>Comment ${vars.companyName} s'y prépare ?</p>

  <p>${vars.yourName}</p>
</body>
</html>`,
    generateText: (vars) => `Bonjour ${vars.recipientName},

Avec ${vars.trend}, beaucoup d'entreprises dans votre secteur ${vars.implication}.

Comment ${vars.companyName} s'y prépare ?

${vars.yourName}`,
  },
};

/**
 * getTemplate
 */
export const getTemplate = (templateId: string): EmailTemplate | undefined => {
  return emailTemplates[templateId];
};

/**
 * getAllTemplates
 */
export const getAllTemplates = (): EmailTemplate[] => {
  return Object.values(emailTemplates);
};

/**
 * renderTemplate
 */
export const renderTemplate = (
  templateId: string,
  variables: Record<string, string>,
): { html: string; text: string; subject: string } | null => {
  const template = getTemplate(templateId);
  /**
   * if
   */
  if (!template) return null;

  const html = template.generateHtml(variables);
  const text = template.generateText(variables);
  const subject = template.subject.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || '');

  return { html, text, subject };
};
