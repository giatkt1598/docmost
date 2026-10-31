import { UnfurlPattern } from '../../registry/integration-provider.interface';
import { CANONICAL_PATH } from '../../utils/canonical-path';
import { escapeForRegex } from '../../utils/integration.utils';

const UUID = '[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}';

// Penpot routes in the URL fragment; every pattern captures the file id.
export function buildPenpotPatterns(baseUrl: string): UnfurlPattern[] {
  const app = `^${escapeForRegex(baseUrl)}${CANONICAL_PATH}\\/?#\\/`;
  return [
    {
      regex: new RegExp(`${app}(?:workspace|view)\\?(?:.*&)?file-id=(${UUID})`),
      type: 'penpot-file',
    },
    {
      regex: new RegExp(`${app}workspace\\/${UUID}\\/(${UUID})`),
      type: 'penpot-file',
    },
    {
      regex: new RegExp(`${app}view\\/(${UUID})`),
      type: 'penpot-file',
    },
  ];
}
