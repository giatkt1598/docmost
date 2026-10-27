import { Module } from '@nestjs/common';
import { PageModule } from '../page/page.module';
import { SearchModule } from '../search/search.module';
import { SpaceModule } from '../space/space.module';
import { CommentModule } from '../comment/comment.module';
import { McpController } from './mcp.controller';
import { McpTokenController } from './mcp-token.controller';
import { McpService } from './mcp.service';
import { McpTokenService } from './mcp-token.service';
import { McpAuthGuard } from './mcp-auth.guard';
import { AiToolsModule } from '../ai-tools/ai-tools.module';
import { LabelModule } from '../label/label.module';
import { FavoriteModule } from '../favorite/favorite.module';
import { WorkspaceToolsService } from './workspace-tools.service';
import { RemoteFileFetcher } from '../media-localize/remote-file-fetcher.service';
import { ImportModule } from '../../integrations/import/import.module';
import { ImportToolsService } from './import-tools.service';

@Module({
  imports: [
    PageModule,
    SearchModule,
    SpaceModule,
    CommentModule,
    AiToolsModule,
    LabelModule,
    FavoriteModule,
    ImportModule,
  ],
  controllers: [McpController, McpTokenController],
  providers: [
    McpService,
    McpTokenService,
    McpAuthGuard,
    WorkspaceToolsService,
    ImportToolsService,
    RemoteFileFetcher,
  ],
  exports: [McpService],
})
export class McpModule {}
