import { Injectable } from '@nestjs/common';
import {
  IntegrationProvider,
  IntegrationDefinition,
  LinkDescription,
  OAuthConfig,
  ProviderAccount,
  ResolveAccountOpts,
  UnfurlOpts,
  UnfurlPattern,
  UnfurlResult,
} from '../../registry/integration-provider.interface';
import { JiraService } from './jira.service';
import { buildJiraPatterns } from './jira-patterns';
import { normalizeBaseUrl } from '../../utils/integration.utils';

const CLOUD_OAUTH: OAuthConfig = {
  authUrl: 'https://auth.atlassian.com/authorize',
  tokenUrl: 'https://auth.atlassian.com/oauth/token',
  scopes: ['read:jira-work', 'read:jira-user', 'read:me', 'offline_access'],
  authParams: { audience: 'api.atlassian.com', prompt: 'consent' },
  tokenRequestFormat: 'json',
};

// A base URL means Data Center; without one the provider talks to Jira Cloud.
@Injectable()
export class JiraProvider extends IntegrationProvider {
  definition: IntegrationDefinition = {
    type: 'jira',
    name: 'Jira',
    description: 'Link previews for Jira issues',
    icon: 'jira',
    capabilities: ['oauth', 'unfurl'],
    oauth: CLOUD_OAUTH,
    setup: {
      baseUrl: 'optional',
      defaultLabel: 'Jira Cloud',
      baseUrlPlaceholder: 'https://jira.example.com',
      appRegistrationUrl: 'https://developer.atlassian.com/console/myapps/',
    },
  };

  constructor(private readonly jiraService: JiraService) {
    super();
  }

  getOAuthConfig(settings: Record<string, any>): OAuthConfig {
    const baseUrl = this.resolveBaseUrl(settings);
    if (!baseUrl) return CLOUD_OAUTH;
    return {
      authUrl: `${baseUrl}/rest/oauth2/latest/authorize`,
      tokenUrl: `${baseUrl}/rest/oauth2/latest/token`,
      scopes: ['READ'],
      redirectUriOnRefresh: true,
    };
  }

  getUnfurlPatterns(settings: Record<string, any>): UnfurlPattern[] {
    return buildJiraPatterns(this.resolveBaseUrl(settings));
  }

  getUnfurlHosts(settings: Record<string, any>): string[] {
    const baseUrl = this.resolveBaseUrl(settings);
    return [baseUrl ? new URL(baseUrl).hostname : '*.atlassian.net'];
  }

  async resolveAccount(opts: ResolveAccountOpts): Promise<ProviderAccount> {
    const baseUrl = this.resolveBaseUrl(opts.settings);
    return baseUrl
      ? this.jiraService.getServerAccount(opts.accessToken, baseUrl)
      : this.jiraService.getCloudAccount(opts.accessToken);
  }

  async unfurl(opts: UnfurlOpts): Promise<UnfurlResult> {
    const { accessToken, match, url } = opts;
    const apiBaseUrl =
      this.resolveBaseUrl(opts.settings) ??
      (await this.jiraService.getCloudApiBaseUrl(accessToken, url));
    return this.jiraService.unfurlIssue(accessToken, apiBaseUrl, match[1], url);
  }

  describeLink(
    _patternType: string,
    match: RegExpMatchArray,
    url: string,
  ): LinkDescription {
    return { title: match[1], description: new URL(url).host };
  }

  private resolveBaseUrl(settings?: Record<string, any>): string | null {
    const baseUrl = settings?.baseUrl;
    return typeof baseUrl === 'string' ? normalizeBaseUrl(baseUrl) : null;
  }
}
