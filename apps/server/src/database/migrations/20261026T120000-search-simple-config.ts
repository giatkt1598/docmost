import { type Kysely, sql } from 'kysely';

// The 'english' configuration drops Vietnamese words that, once accents are
// stripped, collide with English stop words (thể -> the, nó -> no, ...).
// 'simple' keeps every word; unaccenting still makes matching accent-blind.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE OR REPLACE FUNCTION pages_tsvector_trigger() RETURNS trigger AS $$
    begin
        new.tsv :=
                  setweight(to_tsvector('simple', f_unaccent(coalesce(new.title, ''))), 'A') ||
                  setweight(to_tsvector('simple', f_unaccent(substring(coalesce(new.text_content, ''), 1, 1000000))), 'B');
        return new;
    end;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`
    UPDATE pages SET tsv =
      setweight(to_tsvector('simple', f_unaccent(coalesce(title, ''))), 'A') ||
      setweight(to_tsvector('simple', f_unaccent(substring(coalesce(text_content, ''), 1, 1000000))), 'B')
  `.execute(db);

  // attachments: the file name weighs more than the extracted text
  await sql`
    CREATE OR REPLACE FUNCTION attachments_tsvector_trigger() RETURNS trigger AS $$
    begin
        new.tsv :=
                  setweight(to_tsvector('simple', f_unaccent(translate(coalesce(new.file_name, ''), '_.-', '   '))), 'A') ||
                  setweight(to_tsvector('simple', f_unaccent(substring(coalesce(new.text_content, ''), 1, 1000000))), 'B');
        return new;
    end;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`
    CREATE OR REPLACE TRIGGER attachments_tsvector_update
      BEFORE INSERT OR UPDATE OF file_name, text_content ON attachments
      FOR EACH ROW EXECUTE FUNCTION attachments_tsvector_trigger();
  `.execute(db);

  await sql`
    UPDATE attachments SET tsv =
      setweight(to_tsvector('simple', f_unaccent(translate(coalesce(file_name, ''), '_.-', '   '))), 'A') ||
      setweight(to_tsvector('simple', f_unaccent(substring(coalesce(text_content, ''), 1, 1000000))), 'B')
    WHERE text_content IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS attachments_tsvector_update ON attachments`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS attachments_tsvector_trigger()`.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION pages_tsvector_trigger() RETURNS trigger AS $$
    begin
        new.tsv :=
                  setweight(to_tsvector('english', f_unaccent(coalesce(new.title, ''))), 'A') ||
                  setweight(to_tsvector('english', f_unaccent(substring(coalesce(new.text_content, ''), 1, 1000000))), 'B');
        return new;
    end;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`
    UPDATE pages SET tsv =
      setweight(to_tsvector('english', f_unaccent(coalesce(title, ''))), 'A') ||
      setweight(to_tsvector('english', f_unaccent(substring(coalesce(text_content, ''), 1, 1000000))), 'B')
  `.execute(db);
}
