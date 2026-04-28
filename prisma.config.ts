import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/postgresql/schema.prisma",
  migrations: {
    path: "prisma/postgresql/migrations",
    seed: "node prisma/seed.cjs",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
