import { type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('attachments')
    .addColumn('template_id', 'uuid', (col) =>
      col.references('templates.id').onDelete('cascade'),
    )
    .execute();

  await db.schema
    .createIndex('idx_attachments_template_id')
    .ifNotExists()
    .on('attachments')
    .column('template_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('attachments')
    .dropColumn('template_id')
    .execute();
}
