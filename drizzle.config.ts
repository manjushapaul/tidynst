import { defineConfig } from "drizzle-kit";

// Used only for generating and checking migration files. Migrations are applied by
// `npm run db:migrate`, which validates the target database before connecting.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
