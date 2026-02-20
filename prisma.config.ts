import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: './packages/database/prisma/schema',
  datasource: {
    url: env("DATABASE_URL"),
  },
});
