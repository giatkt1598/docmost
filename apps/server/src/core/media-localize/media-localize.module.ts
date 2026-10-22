import { Module } from '@nestjs/common';
import { AttachmentModule } from '../attachment/attachment.module';
import { CollaborationModule } from '../../collaboration/collaboration.module';
import { MediaLocalizeService } from './media-localize.service';
import { MediaLocalizeProcessor } from './media-localize.processor';
import { RemoteFileFetcher } from './remote-file-fetcher.service';

@Module({
  imports: [AttachmentModule, CollaborationModule],
  providers: [MediaLocalizeService, MediaLocalizeProcessor, RemoteFileFetcher],
})
export class MediaLocalizeModule {}
