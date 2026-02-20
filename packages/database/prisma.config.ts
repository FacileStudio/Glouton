import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: './prisma/schema',
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});
