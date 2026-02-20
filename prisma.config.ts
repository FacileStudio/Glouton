import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: './packages/database/prisma/schema',
  datasource: {
    url: process.env.DATABASE_URL || "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
