import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/modules/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL_OWNER ?? '' },
  strict: true,
  verbose: true,
});
