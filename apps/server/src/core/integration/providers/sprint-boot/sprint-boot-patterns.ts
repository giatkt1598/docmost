import { UnfurlPattern } from '../../registry/integration-provider.interface';
import { CANONICAL_PATH } from '../../utils/canonical-path';
import { escapeForRegex } from '../../utils/integration.utils';

export const TICKET_KEY = '([A-Za-z][A-Za-z0-9]{1,9}-[1-9][0-9]*)';

// Sprint Boot opens a ticket at /browse/KEY-12; the pattern captures the key.
export function buildSprintBootPatterns(baseUrl: string): UnfurlPattern[] {
  return [
    {
      regex: new RegExp(
        `^${escapeForRegex(baseUrl)}${CANONICAL_PATH}\/browse\/${TICKET_KEY}(?![A-Za-z0-9])`,
      ),
      type: 'sprint-boot-ticket',
    },
  ];
}
