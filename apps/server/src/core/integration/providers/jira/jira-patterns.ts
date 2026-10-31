import { UnfurlPattern } from '../../registry/integration-provider.interface';
import { CANONICAL_PATH } from '../../utils/canonical-path';
import { escapeForRegex } from '../../utils/integration.utils';

const ISSUE_KEY = '([A-Za-z0-9]+-\\d+)';
const CLOUD_SITE = 'https:\\/\\/[A-Za-z0-9-]+\\.atlassian\\.net';

// Every pattern captures the issue key. Without a base URL, links on any Jira Cloud site match.
export function buildJiraPatterns(baseUrl: string | null): UnfurlPattern[] {
  const site = baseUrl ? escapeForRegex(baseUrl) : CLOUD_SITE;
  const prefix = `^${site}${CANONICAL_PATH}`;
  const patterns: UnfurlPattern[] = [
    {
      regex: new RegExp(`${prefix}\\/browse\\/${ISSUE_KEY}`),
      type: 'jira-issue',
    },
    {
      regex: new RegExp(
        `${prefix}\\/secure\\/RapidBoard\\.jspa\\?(?:.*&)?selectedIssue=${ISSUE_KEY}`,
      ),
      type: 'jira-issue',
    },
  ];
  if (!baseUrl) {
    patterns.push({
      regex: new RegExp(
        `${prefix}\\/jira\\/software(?:\\/c)?\\/projects\\/[\\w-]+\\/boards\\/\\d+(?:\\/\\w+)?\\?(?:.*&)?selectedIssue=${ISSUE_KEY}`,
      ),
      type: 'jira-issue',
    });
  }
  return patterns;
}
