import { generateOpenApiDocument } from 'trpc-to-openapi';

const baseUrl = process.env.BACKEND_URL || 'http://localhost:3001';

export const createOpenApiDocument = (appRouter: any) =>
  generateOpenApiDocument(appRouter, {
    title: 'Glouton API',
    version: '1.0.0',
    baseUrl: `${baseUrl}`,
    description:
      'Glouton lead generation platform API with tRPC, authentication, lead scoring, and web scraping.',
    tags: ['Authentication', 'Users', 'Leads', 'Email', 'Teams'],
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token obtained from login endpoint',
      },
    },
  });
