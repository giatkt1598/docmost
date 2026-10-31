import { UnfurlPattern } from '../../registry/integration-provider.interface';
import { CANONICAL_PATH } from '../../utils/canonical-path';
import { escapeForRegex } from '../../utils/integration.utils';

export function buildGiteaPatterns(baseUrl: string): UnfurlPattern[] {
  const repo = `^${escapeForRegex(baseUrl)}${CANONICAL_PATH}\\/([a-zA-Z0-9\\-_.]+)\\/([a-zA-Z0-9\\-_.]+)`;
  return [
    // Commit within a PR: /:owner/:repo/pulls/:num/commits/:sha
    {
      regex: new RegExp(`${repo}\\/pulls\\/(\\d+)\\/commits\\/([a-f0-9]+)`),
      type: 'gitea-pr-commit',
    },
    // PR sub-pages: /:owner/:repo/pulls/:num(/files|/commits)?
    {
      regex: new RegExp(`${repo}\\/pulls\\/(\\d+)`),
      type: 'gitea-pr',
    },
    // Single issue: /:owner/:repo/issues/:num
    {
      regex: new RegExp(`${repo}\\/issues\\/(\\d+)`),
      type: 'gitea-issue',
    },
    // Commit: /:owner/:repo/commit/:sha
    {
      regex: new RegExp(`${repo}\\/commit\\/([a-f0-9]+)`),
      type: 'gitea-commit',
    },
    // File: /:owner/:repo/src/(branch|tag|commit)/:ref/:path(#L:start(-L:end))?
    {
      regex: new RegExp(
        `${repo}\\/src\\/(?:branch|tag|commit)\\/([^\\/]+)\\/(.+?)(?:#L(\\d+)(?:-L(\\d+))?)?$`,
      ),
      type: 'gitea-file',
    },
    {
      regex: new RegExp(`${repo}\\/pulls\\/?(?:\\?.*)?$`),
      type: 'gitea-pulls-list',
    },
    {
      regex: new RegExp(`${repo}\\/issues\\/?(?:\\?.*)?$`),
      type: 'gitea-issues-list',
    },
    {
      regex: new RegExp(`${repo}\\/releases(?:[\\/?].*)?$`),
      type: 'gitea-releases-list',
    },
    // Repo: /:owner/:repo
    {
      regex: new RegExp(`${repo}\\/?$`),
      type: 'gitea-repo',
    },
  ];
}
