import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import {
  IntegrationConfig,
  InsertableIntegrationConfig,
} from '@docmost/db/types/entity.types';
import { dbOrTx } from '@docmost/db/utils';

@Injectable()
export class IntegrationConfigRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findByWorkspaceAndType(
    workspaceId: string,
    type: string,
    trx?: KyselyTransaction,
  ): Promise<IntegrationConfig | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('integrationConfigs')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('type', '=', type)
      .executeTakeFirst();
  }

  async findAllByWorkspace(
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<IntegrationConfig[]> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('integrationConfigs')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async upsert(
    config: InsertableIntegrationConfig,
    trx?: KyselyTransaction,
  ): Promise<IntegrationConfig> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('integrationConfigs')
      .values(config)
      .onConflict((oc) =>
        oc.columns(['workspaceId', 'type']).doUpdateSet({
          baseUrl: config.baseUrl,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          updatedById: config.updatedById,
          updatedAt: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
