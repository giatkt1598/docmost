import { Injectable } from '@nestjs/common';
import {
  ProviderAccount,
  UnfurlForbiddenError,
  UnfurlResult,
} from '../../registry/integration-provider.interface';
import { relativeTime } from '../../utils/relative-time';
import { providerApiFetch } from '../../utils/provider-fetch';
import { toProviderAccount } from '../../utils/integration.utils';

export type GiteaRepo = { apiBaseUrl: string; owner: string; repo: string };

function repoApiPath({ owner, repo }: GiteaRepo): string {
  // encodeURIComponent keeps . and .., which the URL parser would resolve out of the path.
  if ([owner, repo].some((name) => name === '.' || name === '..')) {
    throw new UnfurlForbiddenError('Gitea repository path has a dot segment');
  }
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

// Without an authorization the call reads as an anonymous visitor, so only public data comes back.
@Injectable()
export class GiteaService {
  async getAccount(
    authorization: string,
    apiBaseUrl: string,
  ): Promise<ProviderAccount> {
    const data = await this.apiGet(authorization, apiBaseUrl, '/user');
    return toProviderAccount({
      id: data.id,
      displayName: data.full_name,
      username: data.login,
    });
  }

  async unfurlPullRequest(
    authorization: string | undefined,
    target: GiteaRepo,
    number: number,
    url: string,
  ): Promise<UnfurlResult> {
    const data = await this.apiGet(
      authorization,
      target.apiBaseUrl,
      `${repoApiPath(target)}/pulls/${number}`,
    );

    const author = data.user?.login;
    return {
      title: data.title,
      description: this.describe(
        `#${data.number}`,
        data.updated_at ?? data.created_at,
        author,
      ),
      url,
      ...this.source(),
      status: this.formatPrStatus(data),
      statusColor: this.getPrStatusColor(data),
      author,
      authorAvatarUrl: data.user?.avatar_url,
      metadata: {
        type: 'pr',
        number: data.number,
        repo: `${target.owner}/${target.repo}`,
        labels: data.labels?.map((l: any) => l.name) ?? [],
        draft: data.draft,
        additions: data.additions,
        deletions: data.deletions,
      },
    };
  }

  async unfurlIssue(
    authorization: string | undefined,
    target: GiteaRepo,
    number: number,
    url: string,
  ): Promise<UnfurlResult> {
    const data = await this.apiGet(
      authorization,
      target.apiBaseUrl,
      `${repoApiPath(target)}/issues/${number}`,
    );

    const author = data.user?.login;
    return {
      title: data.title,
      description: this.describe(
        `#${data.number}`,
        data.updated_at ?? data.created_at,
        author,
      ),
      url,
      ...this.source(),
      status: data.state,
      statusColor: data.state === 'open' ? 'green' : 'violet',
      author,
      authorAvatarUrl: data.user?.avatar_url,
      metadata: {
        type: 'issue',
        number: data.number,
        repo: `${target.owner}/${target.repo}`,
        labels: data.labels?.map((l: any) => l.name) ?? [],
        assignees: data.assignees?.map((a: any) => a.login) ?? [],
      },
    };
  }

  async unfurlRepo(
    authorization: string | undefined,
    target: GiteaRepo,
    url: string,
  ): Promise<UnfurlResult> {
    const data = await this.apiGet(
      authorization,
      target.apiBaseUrl,
      repoApiPath(target),
    );

    return {
      title: data.full_name,
      description: data.description?.slice(0, 200) || undefined,
      url,
      ...this.source(),
      status: data.private ? 'Private' : 'Public',
      statusColor: data.private ? 'gray' : 'green',
      author: data.owner?.login,
      authorAvatarUrl: data.owner?.avatar_url,
      metadata: {
        type: 'repo',
        repo: `${target.owner}/${target.repo}`,
        stars: data.stars_count,
        forks: data.forks_count,
        language: data.language,
        defaultBranch: data.default_branch,
      },
    };
  }

  // Gitea serves a single commit under /git/commits, unlike GitHub's /commits.
  async unfurlCommit(
    authorization: string | undefined,
    target: GiteaRepo,
    sha: string,
    url: string,
  ): Promise<UnfurlResult> {
    const data = await this.apiGet(
      authorization,
      target.apiBaseUrl,
      `${repoApiPath(target)}/git/commits/${sha}`,
    );

    const shortSha = data.sha?.slice(0, 7);
    const author = data.author?.login ?? data.commit?.author?.name;
    return {
      title: data.commit?.message?.split('\n')[0] ?? shortSha,
      description: this.describe(
        shortSha,
        data.commit?.author?.date ?? data.commit?.committer?.date,
        author,
      ),
      url,
      ...this.source(),
      author,
      authorAvatarUrl: data.author?.avatar_url,
      metadata: {
        type: 'commit',
        sha: data.sha,
        shortSha,
        repo: `${target.owner}/${target.repo}`,
        stats: data.stats,
      },
    };
  }

  unfurlFile(
    target: GiteaRepo,
    ref: string,
    path: string,
    startLine: number | undefined,
    endLine: number | undefined,
    url: string,
  ): UnfurlResult {
    const fileName = path.split('/').pop() ?? path;
    const lineRange = startLine
      ? endLine
        ? `L${startLine}-L${endLine}`
        : `L${startLine}`
      : undefined;

    return {
      title: lineRange ? `${fileName}#${lineRange}` : fileName,
      description: `${target.owner}/${target.repo} · ${ref.slice(0, 7)}`,
      url,
      ...this.source(),
      metadata: {
        type: 'file',
        repo: `${target.owner}/${target.repo}`,
        ref,
        path,
        startLine,
        endLine,
      },
    };
  }

  async unfurlCollectionPage(
    authorization: string | undefined,
    target: GiteaRepo,
    collectionType: string,
    url: string,
  ): Promise<UnfurlResult> {
    const data = await this.apiGet(
      authorization,
      target.apiBaseUrl,
      repoApiPath(target),
    );

    const labels: Record<string, string> = {
      'pulls-list': 'Pull Requests',
      'issues-list': 'Issues',
      'releases-list': 'Releases',
    };

    return {
      title: `${labels[collectionType] ?? collectionType} · ${data.full_name}`,
      description: `${target.owner}/${target.repo}`,
      url,
      ...this.source(),
      author: data.owner?.login,
      authorAvatarUrl: data.owner?.avatar_url,
      metadata: {
        type: collectionType,
        repo: `${target.owner}/${target.repo}`,
      },
    };
  }

  private source() {
    return { provider: 'gitea', providerIcon: 'gitea' };
  }

  private describe(id: string, date?: string, author?: string): string {
    return [id, date && relativeTime(date), author].filter(Boolean).join(' · ');
  }

  private formatPrStatus(pr: any): string {
    if (pr.merged) return 'merged';
    if (pr.draft) return 'draft';
    return pr.state;
  }

  private getPrStatusColor(pr: any): string {
    if (pr.merged) return 'violet';
    if (pr.draft) return 'gray';
    if (pr.state === 'open') return 'green';
    return 'red';
  }

  private async apiGet(
    authorization: string | undefined,
    apiBaseUrl: string,
    path: string,
  ): Promise<any> {
    const response = await providerApiFetch('Gitea', `${apiBaseUrl}${path}`, {
      headers: {
        ...(authorization ? { Authorization: authorization } : {}),
        Accept: 'application/json',
        'User-Agent': 'Docmost',
      },
    });

    return response.json();
  }
}
