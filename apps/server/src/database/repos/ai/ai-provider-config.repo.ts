import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  AiProviderConfig,
  InsertableAiProviderConfig,
} from '@docmost/db/types/entity.types';

@Injectable()
export class AiProviderConfigRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async find(workspaceId: string): Promise<AiProviderConfig | undefined> {
    return this.db
      .selectFrom('aiProviderConfigs')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async upsert(config: InsertableAiProviderConfig): Promise<AiProviderConfig> {
    const { workspaceId, ...values } = config;
    return this.db
      .insertInto('aiProviderConfigs')
      .values(config)
      .onConflict((oc) =>
        oc.column('workspaceId').doUpdateSet({
          ...values,
          updatedAt: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirst();
  }

  async delete(workspaceId: string): Promise<void> {
    await this.db
      .deleteFrom('aiProviderConfigs')
      .where('workspaceId', '=', workspaceId)
      .execute();
  }
}
