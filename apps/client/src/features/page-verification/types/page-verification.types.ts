export type VerificationMode = "period" | "fixed" | "indefinite";

export type PeriodUnit = "day" | "week" | "month" | "year";

export type VerificationStatus = "verified" | "expiring" | "expired" | "none";

export type IVerificationUser = {
  id: string;
  name: string;
  avatarUrl: string | null;
  email?: string;
};

export type IPageVerification = {
  id?: string;
  pageId: string;
  status: VerificationStatus;
  mode?: VerificationMode;
  periodAmount?: number | null;
  periodUnit?: PeriodUnit | null;
  verifiedAt?: string | null;
  verifiedBy?: IVerificationUser | null;
  expiresAt?: string | null;
  verifiers?: IVerificationUser[];
  permissions: { canManage: boolean; canVerify: boolean };
};

export type IVerificationSettings = {
  mode: VerificationMode;
  periodAmount?: number;
  periodUnit?: PeriodUnit;
  fixedExpiresAt?: string;
  verifierIds: string[];
};

export type IVerificationListItem = {
  id: string;
  pageId: string;
  spaceId: string;
  status: Exclude<VerificationStatus, "none">;
  mode: VerificationMode;
  periodAmount: number | null;
  periodUnit: PeriodUnit | null;
  verifiedAt: string | null;
  verifiedBy: IVerificationUser | null;
  expiresAt: string | null;
  pageTitle: string | null;
  pageSlugId: string;
  pageIcon: string | null;
  spaceName: string;
  spaceSlug: string;
  verifiers: IVerificationUser[];
};

export type IVerificationListParams = {
  spaceId?: string;
  verifierId?: string;
  query?: string;
  cursor?: string;
  limit?: number;
};
