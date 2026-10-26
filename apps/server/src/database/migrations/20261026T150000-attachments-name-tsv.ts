import { type Kysely, sql } from 'kysely';

// Attachments uploaded before the tsvector trigger existed have no tsv, so
// their file names could not be found until their text was extracted.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE attachments SET tsv =
      setweight(to_tsvector('simple', f_unaccent(translate(coalesce(file_name, ''), '_.-', '   '))), 'A') ||
      setweight(to_tsvector('simple', f_unaccent(substring(coalesce(text_content, ''), 1, 1000000))), 'B')
    WHERE tsv IS NULL
  `.execute(db);
}

export async function down(): Promise<void> {
  // nothing to undo: the column stays populated
}
