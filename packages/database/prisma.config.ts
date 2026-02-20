import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: './prisma/schema',
  datasource: {
    url: env("DATABASE_URL", { optional: true }) || "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
