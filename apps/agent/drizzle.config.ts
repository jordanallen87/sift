import { defineConfig } from 'drizzle-kit';

// Drizzle Kit config for `@sift/agent`. `src/db/schema.ts` is authoritative;
// `pnpm --filter @sift/agent db:generate` (drizzle-kit generate) diffs it
// against `drizzle/meta/`'s last snapshot and writes a new numbered SQL
// migration into `drizzle/`. `src/db/migrate.ts` applies those generated
// files itself (see its module comment for why it does not use
// drizzle-orm's own migrator runner) — this config only drives generation.
//
// `dbCredentials.url` is required by drizzle-kit's SQLite config type but is
// not read by the `generate` command (schema-to-snapshot diffing only, no
// live connection); it names the same default local path documented in
// docs/specs/architecture.md ("Local storage defaults to
// `.sift-data/sift.sqlite`") for consistency, not because `generate` opens it.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: 'file:.sift-data/sift.sqlite',
  },
});
