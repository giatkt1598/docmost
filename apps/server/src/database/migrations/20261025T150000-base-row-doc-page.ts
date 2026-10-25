import { type Kysely } from 'kysely';

// A base row can have a page of its own for longer content.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('base_rows')
    .addColumn('doc_page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('set null'),
    )
    .execute();

  await db.schema
    .createIndex('idx_base_rows_doc_page_id')
    .ifNotExists()
    .on('base_rows')
    .column('doc_page_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('base_rows').dropColumn('doc_page_id').execute();
}
