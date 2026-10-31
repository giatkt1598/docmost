import { Injectable } from '@nestjs/common';
import { UnfurlResult } from '../../registry/integration-provider.interface';
import { providerApiFetch } from '../../utils/provider-fetch';

@Injectable()
export class PenpotService {
  async verifyToken(token: string, baseUrl: string): Promise<void> {
    await this.rpc(token, baseUrl, 'get-profile', {});
  }

  // get-file carries the whole design, so it would pass the response size cap.
  async unfurlFile(
    token: string,
    baseUrl: string,
    fileId: string,
    url: string,
  ): Promise<UnfurlResult> {
    const data = await this.rpc(token, baseUrl, 'get-file-summary', {
      id: fileId,
    });

    return {
      title: data.name,
      description: 'Penpot file',
      url,
      provider: 'penpot',
      providerIcon: 'penpot',
      metadata: { type: 'file', fileId },
    };
  }

  private async rpc(
    token: string,
    baseUrl: string,
    command: string,
    params: Record<string, unknown>,
  ): Promise<any> {
    const response = await providerApiFetch(
      'Penpot',
      `${baseUrl}/api/rpc/command/${command}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Docmost',
        },
        body: JSON.stringify(params),
      },
    );

    return response.json();
  }
}
