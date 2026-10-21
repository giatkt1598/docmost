import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ApiDocsController } from './api-docs.controller';
import { ApiDocsService } from './api-docs.service';

@Module({
  imports: [DiscoveryModule],
  controllers: [ApiDocsController],
  providers: [ApiDocsService],
})
export class ApiDocsModule {}
