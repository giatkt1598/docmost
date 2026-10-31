export type IntegrationCapability = "oauth" | "unfurl" | "actions";

export type OAuthConfig = {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  connectionScope?: 'workspace' | 'user';
  credentialsKey?: string;
};

export type IntegrationSetup = {
  auth?: "oauth" | "apiToken";
  baseUrl: "none" | "optional" | "required";
  defaultBaseUrl?: string;
  defaultLabel?: string;
  baseUrlPlaceholder?: string;
  appRegistrationUrl?: string;
  appRegistrationPath?: string;
};

// The client secret never leaves the server.
export type IntegrationConfig = {
  type: string;
  baseUrl: string | null;
  clientId: string | null;
  hasClientSecret: boolean;
  callbackUrl: string;
};

export type IntegrationDefinition = {
  type: string;
  name: string;
  description: string;
  icon: string;
  capabilities: IntegrationCapability[];
  oauth?: OAuthConfig;
  setup?: IntegrationSetup;
  requiresFeature?: string;
};

export type Integration = {
  id: string;
  workspaceId: string;
  type: string;
  settings: Record<string, any> | null;
  installedById: string | null;
  createdAt: string;
  updatedAt: string;
  // Hostnames the provider unfurls; "*.example.com" means any subdomain.
  unfurlHosts?: string[];
};

export type UserConnection = {
  integrationId: string;
  type: string;
  providerUserId: string | null;
  providerDisplayName: string | null;
  connectedAt: string;
  invalidatedAt: string | null;
};

export type UnfurlResult = {
  title: string;
  description?: string;
  url: string;
  provider: string;
  providerIcon?: string;
  status?: string;
  statusColor?: string;
  author?: string;
  authorAvatarUrl?: string;
  metadata?: Record<string, any>;
};

export type UnfurlNeedsConnection = {
  needsConnection: true;
  integrationId: string;
  integrationType: string;
  integrationName: string;
  title: string;
  description?: string;
};
