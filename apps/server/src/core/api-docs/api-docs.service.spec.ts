import { Body, Controller, Post } from '@nestjs/common';
import { MetadataScanner, Reflector } from '@nestjs/core';
import { IsUUID } from 'class-validator';
import { ApiDocsService } from './api-docs.service';
import { ApiDescription, ApiMultipartBody } from './api-docs.decorators';
import { OAuthScope } from '../../common/decorators/oauth-scope.decorator';

class SpaceIdDto {
  @IsUUID()
  spaceId: string;
}

@Controller()
class UploadController {
  @Post('things/upload')
  @OAuthScope('write')
  @ApiDescription('Uploads a thing.')
  @ApiMultipartBody({
    type: 'object',
    properties: { file: { type: 'string', format: 'binary' } },
    required: ['file'],
  })
  upload() {
    return null;
  }

  @Post('things/info')
  @OAuthScope('read')
  info(@Body() dto: SpaceIdDto) {
    return dto;
  }
}

function createService() {
  const discovery = {
    getControllers: () => [{ metatype: UploadController }],
  };
  return new ApiDocsService(
    discovery as any,
    new MetadataScanner(),
    new Reflector(),
    { getUrl: () => 'https://docs.example.com' } as any,
  );
}

describe('ApiDocsService', () => {
  it('documents multipart bodies and descriptions', () => {
    const spec: any = createService().openApi();
    const upload = spec.paths['/api/things/upload'].post;

    expect(upload.description).toBe('Uploads a thing.');
    expect(upload.requestBody.content).toEqual({
      'multipart/form-data': {
        schema: {
          type: 'object',
          properties: { file: { type: 'string', format: 'binary' } },
          required: ['file'],
        },
      },
    });
  });

  it('keeps JSON bodies for DTO routes', () => {
    const spec: any = createService().openApi();
    const info = spec.paths['/api/things/info'].post;

    expect(info.description).toBeUndefined();
    expect(Object.keys(info.requestBody.content)).toEqual(['application/json']);
  });
});
