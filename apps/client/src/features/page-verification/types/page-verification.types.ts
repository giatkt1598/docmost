// Client side of the page-verification API (server: core/page-verification).
// Dates arrive as ISO strings in JSON.

// ---- settings ---------------------------------------------------------------

// How long a verification lasts: renewed for a period, until a fixed date,
// or forever.
export type VerificationMode = "period" | "fixed" | "indefinite";

export type PeriodUnit = "day" | "week" | "month" | "year";

// Body of /page-verifications/create (and, partially, /update), without the
// pageId: periodAmount/periodUnit go with "period", fixedExpiresAt with
// "fixed". At most 5 verifiers.
export interface IVerificationSettings {
  mode: VerificationMode;
  verifierIds: string[];
  periodAmount?: number;
  periodUnit?: PeriodUnit;
  fixedExpiresAt?: string;
}

// ---- people -----------------------------------------------------------------

export interface IVerificationUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

// The user who last verified (the server sends no email for it).
export type VerifiedByUser = Pick<IVerificationUser, "id" | "name" | "avatarUrl">;

// ---- status -----------------------------------------------------------------

// Computed by the server from verifiedAt / expiresAt. "none": the page has
// no verification yet (info endpoint only).
export type VerificationStatus = "verified" | "expiring" | "expired" | "none";

// ---- /page-verifications/info, /create, /update, /verify ----------------------

export interface IPageVerification {
  pageId: string;
  status: VerificationStatus;
  permissions: {
    // may set up, change or remove the verification (page editors)
    canManage: boolean;
    // is one of the verifiers
    canVerify: boolean;
  };
  // the fields below are absent while status is "none"
  id?: string;
  type?: string;
  mode?: VerificationMode | null;
  periodAmount?: number | null;
  periodUnit?: PeriodUnit | null;
  verifiedAt?: string | null;
  verifiedBy?: VerifiedByUser | null;
  expiresAt?: string | null;
  verifiers?: IVerificationUser[];
}

// ---- /page-verifications/list -----------------------------------------------

export interface IVerificationListParams {
  spaceId?: string;
  verifierId?: string;
  // matches the page title
  query?: string;
  limit?: number;
  cursor?: string;
}

export interface IVerificationListItem {
  id: string;
  pageId: string;
  spaceId: string;
  status: Exclude<VerificationStatus, "none">;
  mode: VerificationMode | null;
  periodAmount: number | null;
  periodUnit: PeriodUnit | null;
  verifiedAt: string | null;
  verifiedBy: VerifiedByUser | null;
  expiresAt: string | null;
  pageTitle: string | null;
  pageSlugId: string;
  pageIcon: string | null;
  spaceName: string;
  spaceSlug: string;
  verifiers: IVerificationUser[];
}
