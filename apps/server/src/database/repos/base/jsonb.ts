import { sql } from 'kysely';

// A jsonb parameter. The text cast keeps postgres.js from encoding an
// already-serialized string a second time.
// Typed as any so it can be used where Kysely expects a Json value.
export const jsonb = (value: unknown): any =>
  sql`${JSON.stringify(value)}::text::jsonb`;
