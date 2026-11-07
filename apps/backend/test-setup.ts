process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL ?? 'postgresql://unused@localhost/unused';
process.env.DOMAIN ??= 'http://localhost:3000';
process.env.ENCRYPTION_SECRET ??= 'test-encryption-secret-at-least-32-chars';
process.env.OIDC_ISSUER = 'http://localhost:38917';
process.env.OIDC_CLIENT_ID = 'glouton';
process.env.OIDC_CLIENT_SECRET = 'secret';
