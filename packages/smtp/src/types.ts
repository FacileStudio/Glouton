export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: {
    name: string;
    email: string;
  };
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  generateHtml: (variables: Record<string, string>) => string;
  generateText: (variables: Record<string, string>) => string;
  variables: string[];
}
