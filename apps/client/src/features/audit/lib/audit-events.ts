type AuditEventGroup = {
  group: string;
  events: Record<string, string>;
};

// Labels are i18n keys; an event missing here falls back to its raw name.
export const AUDIT_EVENT_GROUPS: AuditEventGroup[] = [
  {
    group: "Sign-in and accounts",
    events: {
      "user.login": "Logged in",
      "user.login_failed": "Failed login",
      "user.logout": "Logged out",
      "user.created": "Created user",
      "user.updated": "Updated user",
      "user.deleted": "Deleted user",
      "user.activated": "Activated user",
      "user.deactivated": "Deactivated user",
      "user.role_changed": "Changed user role",
      "user.password_changed": "Changed password",
      "user.password_reset": "Reset password",
      "user.password_reset_requested": "Requested password reset",
      "user.mfa_enabled": "Enabled MFA",
      "user.mfa_disabled": "Disabled MFA",
      "user.mfa_backup_code_generated": "Generated MFA backup codes",
    },
  },
  {
    group: "Workspace",
    events: {
      "workspace.updated": "Updated workspace",
      "workspace.invite_created": "Created invitation",
      "workspace.invite_resent": "Resent invitation",
      "workspace.invite_revoked": "Revoked invitation",
      "sso.provider_created": "Created SSO provider",
      "sso.provider_updated": "Updated SSO provider",
      "sso.provider_deleted": "Deleted SSO provider",
      "ai_provider.updated": "Updated AI provider",
      "ai_provider.deleted": "Deleted AI provider",
      "siem_destination.created": "Created SIEM destination",
      "siem_destination.updated": "Updated SIEM destination",
      "siem_destination.deleted": "Deleted SIEM destination",
    },
  },
  {
    group: "Credentials and integrations",
    events: {
      "api_key.created": "Created API key",
      "api_key.updated": "Updated API key",
      "api_key.deleted": "Deleted API key",
      "mcp_token.created": "Created MCP token",
      "mcp_token.revoked": "Revoked MCP token",
      "integration.installed": "Installed integration",
      "integration.uninstalled": "Uninstalled integration",
      "integration.connected": "Connected integration account",
      "integration.disconnected": "Disconnected integration account",
    },
  },
  {
    group: "Spaces and groups",
    events: {
      "space.created": "Created space",
      "space.updated": "Updated space",
      "space.deleted": "Deleted space",
      "space.exported": "Exported space",
      "space.member_added": "Added space member",
      "space.member_removed": "Removed space member",
      "space.member_role_changed": "Changed space member role",
      "group.created": "Created group",
      "group.updated": "Updated group",
      "group.deleted": "Deleted group",
      "group.member_added": "Added group member",
      "group.member_removed": "Removed group member",
    },
  },
  {
    group: "Pages",
    events: {
      "page.created": "Created page",
      "page.duplicated": "Duplicated page",
      "page.moved_to_space": "Moved page to another space",
      "page.trashed": "Moved page to trash",
      "page.deleted": "Deleted page",
      "page.restored": "Restored page",
      "page.imported": "Imported page",
      "page.exported": "Exported page",
      "page.ai_edited": "AI edited page",
      "page.ai_edit_undone": "Undid AI edit",
      "page.restricted": "Restricted page",
      "page.restriction_removed": "Removed page restriction",
      "page.permission_added": "Added page permission",
      "page.permission_removed": "Removed page permission",
      "page.permission_role_changed": "Changed page permission role",
      "page.verification_created": "Added page verification",
      "page.verification_updated": "Updated page verification",
      "page.verification_removed": "Removed page verification",
      "page.verified": "Verified page",
      "share.created": "Shared page",
      "share.deleted": "Stopped sharing page",
      "template.created": "Created template",
      "template.deleted": "Deleted template",
    },
  },
  {
    group: "Comments and files",
    events: {
      "comment.created": "Created comment",
      "comment.updated": "Updated comment",
      "comment.deleted": "Deleted comment",
      "comment.resolved": "Resolved comment",
      "comment.reopened": "Reopened comment",
      "attachment.uploaded": "Uploaded attachment",
      "attachment.deleted": "Deleted attachment",
    },
  },
];

const LABELS: Record<string, string> = Object.assign(
  {},
  ...AUDIT_EVENT_GROUPS.map((group) => group.events),
);

export function auditEventLabel(event: string): string {
  return LABELS[event] ?? event;
}
