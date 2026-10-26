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

@Module({
  imports: [PageModule, SearchModule, SpaceModule, CommentModule, AiToolsModule],
  controllers: [McpController, McpTokenController],
  providers: [McpService, McpTokenService, McpAuthGuard],
  exports: [McpService],
})
export class McpModule {}
