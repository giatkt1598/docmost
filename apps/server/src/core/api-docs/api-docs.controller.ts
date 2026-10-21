import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { ApiDocsService } from './api-docs.service';

// The API reference, generated from the routes and DTOs at runtime.
@UseGuards(JwtAuthGuard)
@Controller('api-docs')
export class ApiDocsController {
  constructor(private readonly apiDocsService: ApiDocsService) {}

  // a plain OpenAPI document, usable by Postman, Swagger UI and codegen
  @SkipTransform()
  @Get('openapi.json')
  openApi() {
    return this.apiDocsService.openApi();
  }
}
