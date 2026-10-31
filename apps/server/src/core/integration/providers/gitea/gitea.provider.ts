import { Injectable } from '@nestjs/common';
import {
  IntegrationProvider,
  IntegrationDefinition,
  LinkDescription,
  OAuthConfig,
  ProviderAccount,
  PublicUnfurlOpts,
  ResolveAccountOpts,
  UnfurlOpts,
  UnfurlPattern,
  UnfurlResult,
} from '../../registry/integration-provider.interface';
import { GiteaService } from './gitea.service';
import { buildGiteaPatterns } from './gitea-patterns';
import { normalizeBaseUrl } from '../../utils/integration.utils';

const SCOPES = ['read:repository', 'read:issue', 'read:user'];

@Injectable()
export class GiteaProvider extends IntegrationProvider {
  definition: IntegrationDefinition = {
    type: 'gitea',
    name: 'Gitea',
    description:
      'Link previews for repos, pull requests, issues, commits, and files on your Gitea server',
    icon: 'gitea',
    capabilities: ['oauth', 'unfurl'],
    // Paths only: the host comes from the workspace's config, see getOAuthConfig.
    oauth: {
      authUrl: '/login/oauth/authorize',
      tokenUrl: '/login/oauth/access_token',
      scopes: SCOPES,
    },
    setup: {
      baseUrl: 'required',
      appRegistrationPath: '/user/settings/applications',
    },
  };

  constructor(private readonly giteaService: GiteaService) {
    super();
  }

  getOAuthConfig(settings: Record<string, any>): OAuthConfig {
    const baseUrl = this.resolveBaseUrl(settings);
    return {
      authUrl: `${baseUrl}/login/oauth/authorize`,
      tokenUrl: `${baseUrl}/login/oauth/access_token`,
      scopes: SCOPES,
    };
  }

  getUnfurlPatterns(settings: Record<string, any>): UnfurlPattern[] {
    const baseUrl = this.resolveBaseUrl(settings);
    return baseUrl ? buildGiteaPatterns(baseUrl) : [];
  }

  getUnfurlHosts(settings: Record<string, any>): string[] {
    const baseUrl = this.resolveBaseUrl(settings);
    return baseUrl ? [new URL(baseUrl).hostname] : [];
  }

  async resolveAccount(opts: ResolveAccountOpts): Promise<ProviderAccount> {
    return this.giteaService.getAccount(
      `Bearer ${opts.accessToken}`,
      this.resolveApiBaseUrl(opts.settings),
    );
  }

  async unfurl(opts: UnfurlOpts): Promise<UnfurlResult> {
    return this.unfurlWith(`Bearer ${opts.accessToken}`, opts);
  }

  async unfurlPublic(opts: PublicUnfurlOpts): Promise<UnfurlResult> {
    return this.unfurlWith(undefined, opts);
  }

  private async unfurlWith(
    authorization: string | undefined,
    opts: PublicUnfurlOpts,
  ): Promise<UnfurlResult> {
    const { match, patternType, url } = opts;
    const target = {
      apiBaseUrl: this.resolveApiBaseUrl(opts.settings),
      owner: match[1],
      repo: match[2],
    };

    switch (patternType) {
      case 'gitea-pr':
        return this.giteaService.unfurlPullRequest(
          authorization, target, parseInt(match[3], 10), url,
        );

      case 'gitea-issue':
        return this.giteaService.unfurlIssue(
          authorization, target, parseInt(match[3], 10), url,
        );

      case 'gitea-repo':
        return this.giteaService.unfurlRepo(authorization, target, url);

      case 'gitea-commit':
        return this.giteaService.unfurlCommit(
          authorization, target, match[3], url,
        );

      case 'gitea-pr-commit':
        return this.giteaService.unfurlCommit(
          authorization, target, match[4], url,
        );

      case 'gitea-file': {
        const startLine = match[5] ? parseInt(match[5], 10) : undefined;
        const endLine = match[6] ? parseInt(match[6], 10) : undefined;
        return this.giteaService.unfurlFile(
          target, match[3], match[4], startLine, endLine, url,
        );
      }

      case 'gitea-pulls-list':
      case 'gitea-issues-list':
      case 'gitea-releases-list':
        return this.giteaService.unfurlCollectionPage(
          authorization, target, patternType.replace('gitea-', ''), url,
        );

      default:
        throw new Error(`Unknown Gitea pattern type: ${patternType}`);
    }
  }

  describeLink(
    patternType: string,
    match: RegExpMatchArray,
  ): LinkDescription | null {
    const repo = `${match[1]}/${match[2]}`;
    switch (patternType) {
      case 'gitea-pr':
        return { title: `Pull Request #${match[3]}`, description: repo };
      case 'gitea-pr-commit':
        return { title: `Commit ${match[4].slice(0, 7)}`, description: repo };
      case 'gitea-issue':
        return { title: `Issue #${match[3]}`, description: repo };
      case 'gitea-commit':
        return { title: `Commit ${match[3].slice(0, 7)}`, description: repo };
      case 'gitea-file':
        return { title: match[4], description: repo };
      case 'gitea-pulls-list':
        return { title: 'Pull Requests', description: repo };
      case 'gitea-issues-list':
        return { title: 'Issues', description: repo };
      case 'gitea-releases-list':
        return { title: 'Releases', description: repo };
      case 'gitea-repo':
        return { title: repo };
      default:
        return null;
    }
  }

  private resolveBaseUrl(settings?: Record<string, any>): string | null {
    const baseUrl = settings?.baseUrl;
    return typeof baseUrl === 'string' ? normalizeBaseUrl(baseUrl) : null;
  }

  private resolveApiBaseUrl(settings?: Record<string, any>): string {
    const baseUrl = this.resolveBaseUrl(settings);
    if (!baseUrl) {
      throw new Error('Gitea base URL is not configured');
    }
    return `${baseUrl}/api/v1`;
  }
}
