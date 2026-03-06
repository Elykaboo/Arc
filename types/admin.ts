export type AdminRole = "owner" | "moderator";

export type AccountStatus = "active" | "suspended";

export type ModerationTargetType = "user" | "post" | "comment" | "like";

export type ModerationActionType = "suspend" | "unsuspend" | "hide" | "unhide" | "delete";

export type AdminUserRecord = {
  uid: string;
  email: string;
  role: AdminRole;
  active: boolean;
  grantedAt: string | null;
  grantedBy: string;
};

export type SuspensionState = {
  accountStatus: AccountStatus;
  suspensionReason: string;
  suspensionEndsAt: string | null;
  moderatedAt: string | null;
  moderatedBy: string;
};

export type ModerationAction = {
  id: string;
  targetType: ModerationTargetType;
  targetId: string;
  action: ModerationActionType;
  reason: string;
  performedByUid: string;
  performedByEmail: string;
  metadata: Record<string, unknown>;
  createdAt: string | null;
};

export type AdminApiResponse<T> = {
  data: T | null;
  error?: string;
  meta?: Record<string, unknown>;
};

export type HardDeleteResult = {
  postsDeleted: number;
  commentsDeleted: number;
  likesDeleted: number;
  followEdgesDeleted: number;
  notificationsDeleted: number;
  topLevelDocsDeleted: number;
  authDeleted: boolean;
  authAlreadyMissing: boolean;
  userDocDeleted: boolean;
};

export type DeleteReasonPayload = {
  reason?: string;
};
