// Enterprise-edition features and whether this build ships its own
// implementation of them. Update when one is added.
export const EDITION_FEATURES: { label: string; available: boolean }[] = [
  { label: "MCP Support", available: true },
  { label: "SSO (SAML, OIDC, LDAP)", available: true },
  { label: "Multi-factor Authentication (2FA)", available: true },
  { label: "Page-level Permissions", available: true },
  { label: "Page Verification", available: true },
  { label: "Security & Sharing Controls", available: true },
  { label: "Resolve Comments", available: true },
  { label: "Templates", available: true },
  { label: "Personal Spaces", available: true },
  { label: "API Keys", available: true },
  { label: "AI Integration (Chat, Search & Assistant)", available: true },
  { label: "SCIM Provisioning", available: false },
  { label: "Approval Workflow", available: false },
  { label: "Audit Logs", available: false },
  { label: "Advanced Search Engine Support", available: true },
  { label: "Full-text Search in Attachments (PDF, DOCX)", available: true },
  { label: "Confluence Import", available: true },
  { label: "PDF & DOCX Import", available: true },
  { label: "Bases", available: true },
  { label: "Kanban", available: true },
];
