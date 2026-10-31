import { Injectable } from '@nestjs/common';
import {
  ProviderAccount,
  UnfurlForbiddenError,
  UnfurlResult,
} from '../../registry/integration-provider.interface';
import { providerApiFetch } from '../../utils/provider-fetch';
import { toProviderAccount } from '../../utils/integration.utils';

const ATLASSIAN_API = 'https://api.atlassian.com';
const ISSUE_FIELDS = 'summary,status,assignee,issuetype,updated';

const STATUS_COLORS: Record<string, string> = {
  new: 'gray',
  indeterminate: 'blue',
  done: 'green',
};

@Injectable()
export class JiraService {
  async getCloudAccount(accessToken: string): Promise<ProviderAccount> {
    const data = await this.apiGet(accessToken, `${ATLASSIAN_API}/me`);
    return toProviderAccount({
      id: data.account_id,
      displayName: data.name,
      username: data.nickname,
    });
  }

  async getServerAccount(
    accessToken: string,
    baseUrl: string,
  ): Promise<ProviderAccount> {
    const data = await this.apiGet(
      accessToken,
      `${baseUrl}/rest/api/2/myself`,
    );
    return toProviderAccount({
      id: data.key ?? data.name,
      displayName: data.displayName,
      username: data.name,
    });
  }

  // Cloud tokens only work through api.atlassian.com, addressed by the site's cloud id.
  async getCloudApiBaseUrl(accessToken: string, url: string): Promise<string> {
    const resources = await this.apiGet(
      accessToken,
      `${ATLASSIAN_API}/oauth/token/accessible-resources`,
    );
    const origin = new URL(url).origin;
    const site = (Array.isArray(resources) ? resources : []).find(
      (resource: any) => this.originOf(resource?.url) === origin,
    );
    if (!site?.id) {
      throw new UnfurlForbiddenError('Jira site is not accessible to this user');
    }
    return `${ATLASSIAN_API}/ex/jira/${encodeURIComponent(site.id)}`;
  }

  async unfurlIssue(
    accessToken: string,
    apiBaseUrl: string,
    issueKey: string,
    url: string,
  ): Promise<UnfurlResult> {
    const data = await this.apiGet(
      accessToken,
      `${apiBaseUrl}/rest/api/2/issue/${encodeURIComponent(issueKey)}?fields=${ISSUE_FIELDS}`,
    );

    const { fields } = data;
    return {
      title: fields?.summary ?? data.key,
      url,
      provider: 'jira',
      providerIcon: 'jira',
      status: fields?.status?.name,
      statusColor: STATUS_COLORS[fields?.status?.statusCategory?.key] ?? 'gray',
      author: fields?.assignee?.displayName,
      authorAvatarUrl: fields?.assignee?.avatarUrls?.['48x48'],
      metadata: {
        type: 'issue',
        issueKey: data.key,
        issueType: fields?.issuetype?.name,
        issueTypeIconUrl: fields?.issuetype?.iconUrl,
        updatedAt: fields?.updated,
      },
    };
  }

  private originOf(value: unknown): string | null {
    try {
      return new URL(String(value)).origin;
    } catch {
      return null;
    }
  }

  private async apiGet(accessToken: string, url: string): Promise<any> {
    const response = await providerApiFetch('Jira', url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    return response.json();
  }
}
