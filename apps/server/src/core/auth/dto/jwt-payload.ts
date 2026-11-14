export enum JwtType {
  ACCESS = 'access',
  COLLAB = 'collab',
  EXCHANGE = 'exchange',
  ATTACHMENT = 'attachment',
  MFA_TOKEN = 'mfa_token',
  API_KEY = 'api_key',
  PDF_RENDER = 'pdf_render',
  PDF_EXPORT_DOWNLOAD = 'pdf_export_download',
  OAUTH_ACCESS = 'oauth_access',
  PAGE_UNLOCK = 'page_unlock',
}
export type JwtPayload = {
  sub: string;
  email: string;
  workspaceId: string;
  type: 'access';
  sessionId?: string;
};

export type JwtCollabPayload = {
  sub: string;
  workspaceId: string;
  type: 'collab';
};

export type JwtExchangePayload = {
  sub: string;
  workspaceId: string;
  type: 'exchange';
};

export type JwtAttachmentPayload = {
  attachmentId: string;
  pageId: string;
  workspaceId: string;
  type: 'attachment';
};

export interface JwtMfaTokenPayload {
  sub: string;
  workspaceId: string;
  type: 'mfa_token';
}

export type JwtApiKeyPayload = {
  sub: string;
  workspaceId: string;
  apiKeyId: string;
  type: 'api_key';
};

export type JwtPdfRenderPayload = {
  pageId: string;
  workspaceId: string;
  type: 'pdf_render';
};

export type JwtPdfExportDownloadPayload = {
  fileTaskId: string;
  workspaceId: string;
  type: 'pdf_export_download';
};

export type JwtOAuthPayload = {
  sub: string;
  workspaceId: string;
  grantId: string;
  scope: string;
  aud: string;
  iss: string;
  jti: string;
  type: JwtType.OAUTH_ACCESS;
};

// Proof that the password of a protected page was entered. `pv` is the
// password version it was issued for; changing the password makes it stale.
export type JwtPageUnlockPayload = {
  pageId: string;
  workspaceId: string;
  pv: number;
  type: 'page_unlock';
};
