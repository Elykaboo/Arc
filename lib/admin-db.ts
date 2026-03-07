import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminAuth } from "@/lib/firebase-admin";
import { getAdminDb } from "@/lib/firebase-admin";
import type {
  AccountStatus,
  AdminRole,
  AdminUserRecord,
  HardDeleteResult,
  ModerationAction,
  ModerationActionType,
  ModerationTargetType,
} from "@/types/admin";

export type AdminUserSummary = {
  uid: string;
  email: string;
  username: string;
  bio: string;
  workoutSplit: string;
  photoDataUrl: string;
  accountStatus: AccountStatus;
  suspensionReason: string;
  suspensionEndsAt: string | null;
  moderatedAt: string | null;
  moderatedBy: string;
  updatedAt: string | null;
};

export type CommunityPostAdminSummary = {
  id: string;
  uid: string;
  authorName: string;
  caption: string;
  createdAt: string | null;
  hiddenByAdmin: boolean;
  hiddenReason: string;
  hiddenAt: string | null;
  hiddenBy: string;
  commentCount: number;
  likeCount: number;
};

const DELETE_BATCH_SIZE = 300;

const toIsoOrNull = (value: unknown): string | null => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return null;
};

const toString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const toBoolean = (value: unknown): boolean => value === true;

const toRole = (value: unknown): AdminRole => (value === "owner" ? "owner" : "moderator");

const toStatus = (value: unknown): AccountStatus => (value === "suspended" ? "suspended" : "active");

export const loadAdminAllowlistRecord = async (uid: string): Promise<AdminUserRecord | null> => {
  const cleanedUid = uid.trim();
  if (!cleanedUid) return null;
  const db = await getAdminDb();
  const snapshot = await db.collection("admins").doc(cleanedUid).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() ?? {};
  return {
    uid: snapshot.id,
    email: toString(data.email),
    role: toRole(data.role),
    active: data.active === true,
    grantedAt: toIsoOrNull(data.grantedAt),
    grantedBy: toString(data.grantedBy),
  };
};

export const loadActiveAdminAllowlistByEmail = async (email: string): Promise<AdminUserRecord | null> => {
  const cleanedEmail = email.trim().toLowerCase();
  if (!cleanedEmail) return null;
  const db = await getAdminDb();
  const snapshot = await db
    .collection("admins")
    .where("email", "==", cleanedEmail)
    .where("active", "==", true)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const document = snapshot.docs[0];
  const data = document.data() ?? {};
  return {
    uid: document.id,
    email: toString(data.email),
    role: toRole(data.role),
    active: data.active === true,
    grantedAt: toIsoOrNull(data.grantedAt),
    grantedBy: toString(data.grantedBy),
  };
};

export const listAdminUsers = async (search = "", maxItems = 80): Promise<AdminUserSummary[]> => {
  const db = await getAdminDb();
  const members = await db.collection("members").limit(Math.max(1, Math.min(500, maxItems * 4))).get();
  const queryText = search.trim().toLowerCase();

  const rows = await Promise.all(
    members.docs.map(async (memberDoc) => {
      const uid = memberDoc.id;
      const memberData = memberDoc.data() ?? {};
      const userRecord = await db.collection("users").doc(uid).get().catch(() => null);
      const email = toString(userRecord?.data()?.email);
      const username = toString(memberData.username);
      const bio = toString(memberData.bio);
      const workoutSplit = toString(memberData.workoutSplit);
      const photoDataUrl = toString(memberData.photoDataUrl);

      const haystack = `${uid} ${email} ${username}`.toLowerCase();
      if (queryText && !haystack.includes(queryText)) return null;

      return {
        uid,
        email,
        username,
        bio,
        workoutSplit,
        photoDataUrl,
        accountStatus: toStatus(memberData.accountStatus),
        suspensionReason: toString(memberData.suspensionReason),
        suspensionEndsAt: toIsoOrNull(memberData.suspensionEndsAt),
        moderatedAt: toIsoOrNull(memberData.moderatedAt),
        moderatedBy: toString(memberData.moderatedBy),
        updatedAt: toIsoOrNull(memberData.updatedAt),
      } satisfies AdminUserSummary;
    }),
  );

  return rows.filter((item): item is AdminUserSummary => Boolean(item)).slice(0, maxItems);
};

export const getAdminUserByUid = async (uid: string): Promise<AdminUserSummary | null> => {
  const cleanedUid = uid.trim();
  if (!cleanedUid) return null;
  const db = await getAdminDb();
  const memberDoc = await db.collection("members").doc(cleanedUid).get();
  if (!memberDoc.exists) return null;
  const memberData = memberDoc.data() ?? {};
  const userRecord = await db.collection("users").doc(cleanedUid).get().catch(() => null);
  return {
    uid: cleanedUid,
    email: toString(userRecord?.data()?.email),
    username: toString(memberData.username),
    bio: toString(memberData.bio),
    workoutSplit: toString(memberData.workoutSplit),
    photoDataUrl: toString(memberData.photoDataUrl),
    accountStatus: toStatus(memberData.accountStatus),
    suspensionReason: toString(memberData.suspensionReason),
    suspensionEndsAt: toIsoOrNull(memberData.suspensionEndsAt),
    moderatedAt: toIsoOrNull(memberData.moderatedAt),
    moderatedBy: toString(memberData.moderatedBy),
    updatedAt: toIsoOrNull(memberData.updatedAt),
  };
};

export const setUserSuspension = async (input: {
  uid: string;
  suspended: boolean;
  reason: string;
  suspensionEndsAt: string | null;
  actorUid: string;
}): Promise<AdminUserSummary | null> => {
  const cleanedUid = input.uid.trim();
  if (!cleanedUid) return null;

  const db = await getAdminDb();
  const memberRef = db.collection("members").doc(cleanedUid);
  const memberDoc = await memberRef.get();
  if (!memberDoc.exists) return null;

  await memberRef.set(
    {
      accountStatus: input.suspended ? "suspended" : "active",
      suspensionReason: input.suspended ? input.reason.trim() : "",
      suspensionEndsAt:
        input.suspended && input.suspensionEndsAt ? Timestamp.fromDate(new Date(input.suspensionEndsAt)) : null,
      moderatedAt: FieldValue.serverTimestamp(),
      moderatedBy: input.actorUid,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return getAdminUserByUid(cleanedUid);
};

const countCollectionByField = async (
  collectionName: "communityComments" | "communityLikes",
  fieldName: string,
  value: string,
): Promise<number> => {
  const db = await getAdminDb();
  const snapshot = await db.collection(collectionName).where(fieldName, "==", value).count().get();
  return snapshot.data().count ?? 0;
};

export const listCommunityPostsForAdmin = async (maxItems = 60): Promise<CommunityPostAdminSummary[]> => {
  const db = await getAdminDb();
  const posts = await db
    .collection("communityPosts")
    .orderBy("createdAt", "desc")
    .limit(Math.max(1, Math.min(200, maxItems)))
    .get();

  const rows = await Promise.all(
    posts.docs.map(async (doc) => {
      const data = doc.data() ?? {};
      const [commentCount, likeCount] = await Promise.all([
        countCollectionByField("communityComments", "postId", doc.id),
        countCollectionByField("communityLikes", "postId", doc.id),
      ]);
      return {
        id: doc.id,
        uid: toString(data.uid),
        authorName: toString(data.authorName),
        caption: toString(data.caption),
        createdAt: toIsoOrNull(data.createdAt),
        hiddenByAdmin: toBoolean(data.hiddenByAdmin),
        hiddenReason: toString(data.hiddenReason),
        hiddenAt: toIsoOrNull(data.hiddenAt),
        hiddenBy: toString(data.hiddenBy),
        commentCount,
        likeCount,
      } satisfies CommunityPostAdminSummary;
    }),
  );

  return rows;
};

export const setCommunityPostHiddenState = async (input: {
  postId: string;
  hidden: boolean;
  reason: string;
  actorUid: string;
}): Promise<void> => {
  const cleanedPostId = input.postId.trim();
  if (!cleanedPostId) return;
  const db = await getAdminDb();
  await db.collection("communityPosts").doc(cleanedPostId).set(
    {
      hiddenByAdmin: input.hidden,
      hiddenReason: input.hidden ? input.reason.trim() : "",
      hiddenAt: input.hidden ? FieldValue.serverTimestamp() : null,
      hiddenBy: input.hidden ? input.actorUid : "",
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
};

const deleteSnapshotDocs = async (
  snapshot: FirebaseFirestore.QuerySnapshot,
): Promise<number> => {
  if (snapshot.empty) return 0;
  const db = await getAdminDb();
  let deleted = 0;
  let cursor = 0;

  while (cursor < snapshot.docs.length) {
    const batch = db.batch();
    const chunk = snapshot.docs.slice(cursor, cursor + DELETE_BATCH_SIZE);
    for (const doc of chunk) {
      batch.delete(doc.ref);
      deleted += 1;
    }
    await batch.commit();
    cursor += chunk.length;
  }

  return deleted;
};

const deleteCommunityPostChildren = async (postId: string): Promise<{ commentsDeleted: number; likesDeleted: number }> => {
  const db = await getAdminDb();
  let commentsDeleted = 0;
  let likesDeleted = 0;

  while (true) {
    const comments = await db.collection("communityComments").where("postId", "==", postId).limit(DELETE_BATCH_SIZE).get();
    if (comments.empty) break;
    commentsDeleted += await deleteSnapshotDocs(comments);
  }

  while (true) {
    const likes = await db.collection("communityLikes").where("postId", "==", postId).limit(DELETE_BATCH_SIZE).get();
    if (likes.empty) break;
    likesDeleted += await deleteSnapshotDocs(likes);
  }

  return {
    commentsDeleted,
    likesDeleted,
  };
};

const deleteByTopLevelCollectionField = async (
  collectionName: string,
  fieldName: string,
  value: string,
): Promise<number> => {
  const db = await getAdminDb();
  let deleted = 0;

  while (true) {
    const snapshot = await db.collection(collectionName).where(fieldName, "==", value).limit(DELETE_BATCH_SIZE).get();
    if (snapshot.empty) break;
    deleted += await deleteSnapshotDocs(snapshot);
  }

  return deleted;
};

const forEachUserDoc = async (
  handler: (userDoc: FirebaseFirestore.QueryDocumentSnapshot) => Promise<void>,
): Promise<void> => {
  const db = await getAdminDb();
  let lastUserDocId = "";

  while (true) {
    let query: FirebaseFirestore.Query = db
      .collection("users")
      .orderBy(FieldPath.documentId())
      .limit(DELETE_BATCH_SIZE);

    if (lastUserDocId) {
      query = query.startAfter(lastUserDocId);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    for (const userDoc of snapshot.docs) {
      await handler(userDoc);
    }

    lastUserDocId = snapshot.docs[snapshot.docs.length - 1]?.id ?? "";
    if (snapshot.docs.length < DELETE_BATCH_SIZE) break;
  }
};

const deleteFollowEdgesAcrossUsersByUid = async (
  targetUid: string,
): Promise<number> => {
  const db = await getAdminDb();
  let deleted = 0;

  await forEachUserDoc(async (userDoc) => {
    const followingRef = db.collection("users").doc(userDoc.id).collection("following").doc(targetUid);
    const followersRef = db.collection("users").doc(userDoc.id).collection("followers").doc(targetUid);

    const [followingDoc, followersDoc] = await Promise.all([followingRef.get(), followersRef.get()]);
    const batch = db.batch();
    let hasOps = false;

    if (followingDoc.exists) {
      batch.delete(followingRef);
      deleted += 1;
      hasOps = true;
    }
    if (followersDoc.exists) {
      batch.delete(followersRef);
      deleted += 1;
      hasOps = true;
    }

    if (hasOps) {
      await batch.commit();
    }
  });

  return deleted;
};

const deleteNotificationsAcrossUsersByActorUid = async (
  targetUid: string,
): Promise<number> => {
  const db = await getAdminDb();
  let deleted = 0;

  await forEachUserDoc(async (userDoc) => {
    while (true) {
      const notifications = await db
        .collection("users")
        .doc(userDoc.id)
        .collection("notifications")
        .where("actorUid", "==", targetUid)
        .limit(DELETE_BATCH_SIZE)
        .get();

      if (notifications.empty) break;
      deleted += await deleteSnapshotDocs(notifications);
    }
  });

  return deleted;
};

const deleteTopLevelDocIfExists = async (collectionName: string, docId: string): Promise<number> => {
  const db = await getAdminDb();
  const ref = db.collection(collectionName).doc(docId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return 0;
  await ref.delete();
  return 1;
};

export const deleteCommunityPostAsAdmin = async (
  postId: string,
): Promise<{ postDeleted: boolean; commentsDeleted: number; likesDeleted: number }> => {
  const cleanedPostId = postId.trim();
  if (!cleanedPostId) {
    return { postDeleted: false, commentsDeleted: 0, likesDeleted: 0 };
  }
  const db = await getAdminDb();
  const postRef = db.collection("communityPosts").doc(cleanedPostId);
  const postSnapshot = await postRef.get();
  const { commentsDeleted, likesDeleted } = await deleteCommunityPostChildren(cleanedPostId);

  let postDeleted = false;
  if (postSnapshot.exists) {
    await postRef.delete();
    postDeleted = true;
  }

  return { postDeleted, commentsDeleted, likesDeleted };
};

export const deleteCommunityCommentAsAdmin = async (commentId: string): Promise<void> => {
  const cleanedId = commentId.trim();
  if (!cleanedId) return;
  const db = await getAdminDb();
  await db.collection("communityComments").doc(cleanedId).delete();
};

export const deleteCommunityLikeAsAdmin = async (likeId: string): Promise<void> => {
  const cleanedId = likeId.trim();
  if (!cleanedId) return;
  const db = await getAdminDb();
  await db.collection("communityLikes").doc(cleanedId).delete();
};

export const createModerationAction = async (input: {
  targetType: ModerationTargetType;
  targetId: string;
  action: ModerationActionType;
  reason: string;
  performedByUid: string;
  performedByEmail: string;
  metadata?: Record<string, unknown>;
}): Promise<string> => {
  const db = await getAdminDb();
  const payloadData = {
    targetType: input.targetType,
    targetId: input.targetId.trim(),
    action: input.action,
    reason: input.reason.trim(),
    performedByUid: input.performedByUid.trim(),
    performedByEmail: input.performedByEmail.trim(),
    metadata: input.metadata ?? {},
  };
  const created = await db.collection("adminModerationActions").add({
    ...payloadData,
    createdAt: FieldValue.serverTimestamp(),
  });
  return created.id;
};

export const listModerationActions = async (maxItems = 120): Promise<ModerationAction[]> => {
  const db = await getAdminDb();
  const snapshot = await db
    .collection("adminModerationActions")
    .orderBy("createdAt", "desc")
    .limit(Math.max(1, Math.min(maxItems, 300)))
    .get();

  return snapshot.docs.map((document) => {
    const data = document.data() ?? {};
    return {
      id: document.id,
      targetType: (data.targetType as ModerationTargetType) ?? "post",
      targetId: toString(data.targetId),
      action: (data.action as ModerationActionType) ?? "hide",
      reason: toString(data.reason),
      performedByUid: toString(data.performedByUid),
      performedByEmail: toString(data.performedByEmail),
      metadata:
        data.metadata && typeof data.metadata === "object"
          ? (data.metadata as Record<string, unknown>)
          : {},
      createdAt: toIsoOrNull(data.createdAt),
    };
  });
};

export const deleteUserAccountAsAdmin = async (input: {
  targetUid: string;
  actorUid: string;
  actorRole: AdminRole | null;
  reason: string;
  performedByEmail: string;
}): Promise<HardDeleteResult> => {
  const targetUid = input.targetUid.trim();
  if (!targetUid) {
    throw new Error("Target uid is required.");
  }
  if (input.actorUid.trim() === targetUid) {
    throw new Error("Forbidden: You cannot delete your own account.");
  }

  const db = await getAdminDb();
  const auth = await getAdminAuth();
  const adminDoc = await db.collection("admins").doc(targetUid).get();
  const adminRole = toString(adminDoc.data()?.role);
  if (adminRole === "owner") {
    throw new Error("Forbidden: Owner accounts cannot be deleted.");
  }

  const userDoc = await db.collection("users").doc(targetUid).get();
  const memberDoc = await db.collection("members").doc(targetUid).get();
  const publicProfileDoc = await db.collection("publicProfiles").doc(targetUid).get();

  let authRecord: { email?: string | null } | null = null;
  try {
    authRecord = await auth.getUser(targetUid);
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (!/user-not-found/i.test(code)) {
      throw error;
    }
  }

  if (!userDoc.exists && !memberDoc.exists && !publicProfileDoc.exists && !authRecord) {
    throw new Error("User not found.");
  }

  let postsDeleted = 0;
  let commentsDeleted = 0;
  let likesDeleted = 0;
  let followEdgesDeleted = 0;
  let notificationsDeleted = 0;
  let topLevelDocsDeleted = 0;

  while (true) {
    const posts = await db.collection("communityPosts").where("uid", "==", targetUid).limit(DELETE_BATCH_SIZE).get();
    if (posts.empty) break;
    for (const postDoc of posts.docs) {
      const result = await deleteCommunityPostAsAdmin(postDoc.id);
      if (result.postDeleted) postsDeleted += 1;
      commentsDeleted += result.commentsDeleted;
      likesDeleted += result.likesDeleted;
    }
  }

  commentsDeleted += await deleteByTopLevelCollectionField("communityComments", "uid", targetUid);
  likesDeleted += await deleteByTopLevelCollectionField("communityLikes", "uid", targetUid);

  followEdgesDeleted += await deleteFollowEdgesAcrossUsersByUid(targetUid);
  notificationsDeleted += await deleteNotificationsAcrossUsersByActorUid(targetUid);

  topLevelDocsDeleted += await deleteTopLevelDocIfExists("members", targetUid);
  topLevelDocsDeleted += await deleteTopLevelDocIfExists("publicProfiles", targetUid);
  topLevelDocsDeleted += await deleteTopLevelDocIfExists("admins", targetUid);

  const userRef = db.collection("users").doc(targetUid);
  const userSnapshot = await userRef.get();
  let userDocDeleted = false;
  if (userSnapshot.exists) {
    await db.recursiveDelete(userRef);
    userDocDeleted = true;
  }

  let authDeleted = false;
  let authAlreadyMissing = false;
  try {
    await auth.deleteUser(targetUid);
    authDeleted = true;
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (/user-not-found/i.test(code)) {
      authAlreadyMissing = true;
    } else {
      throw error;
    }
  }

  await createModerationAction({
    targetType: "user",
    targetId: targetUid,
    action: "delete",
    reason: input.reason.trim() || "Hard deleted by admin.",
    performedByUid: input.actorUid,
    performedByEmail: input.performedByEmail,
    metadata: {
      redacted: true,
      targetUid,
      targetEmailSnapshot: authRecord?.email ?? "",
      actorRole: input.actorRole,
      postsDeleted,
      commentsDeleted,
      likesDeleted,
      followEdgesDeleted,
      notificationsDeleted,
      topLevelDocsDeleted,
      userDocDeleted,
      authDeleted,
      authAlreadyMissing,
    },
  });

  return {
    postsDeleted,
    commentsDeleted,
    likesDeleted,
    followEdgesDeleted,
    notificationsDeleted,
    topLevelDocsDeleted,
    authDeleted,
    authAlreadyMissing,
    userDocDeleted,
  };
};
