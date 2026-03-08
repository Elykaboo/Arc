import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type FirestoreDataConverter,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createUserNotification } from "@/lib/notification-db";

export type CommunityPost = {
  id: string;
  uid: string;
  authorName: string;
  authorPhotoDataUrl: string;
  caption: string;
  progressPhotoDataUrl: string;
  progressPhotoDataUrls: string[];
  createdAt: Timestamp | null;
};

export type CommunityComment = {
  id: string;
  postId: string;
  postOwnerUid: string;
  parentCommentId: string | null;
  uid: string;
  authorName: string;
  authorPhotoDataUrl: string;
  text: string;
  createdAt: Timestamp | null;
};

export type CommunityCommentLike = {
  id: string;
  postId: string;
  commentId: string;
  uid: string;
  authorName: string;
  authorPhotoDataUrl: string;
  createdAt: Timestamp | null;
};

export type CommunityLike = {
  id: string;
  postId: string;
  uid: string;
  authorName: string;
  authorPhotoDataUrl: string;
  createdAt: Timestamp | null;
};

type CommunityPostDocument = {
  uid: string;
  authorName: string;
  authorPhotoDataUrl: string;
  caption: string;
  progressPhotoDataUrl: string;
  progressPhotoDataUrls?: string[];
  createdAt?: Timestamp;
};

const normalizePhotoDataUrls = (value: unknown, fallbackValue: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean);
  }

  if (typeof fallbackValue === "string" && fallbackValue.trim()) {
    return [fallbackValue.trim()];
  }

  return [];
};

type CommunityCommentDocument = {
  postId: string;
  postOwnerUid: string;
  parentCommentId?: string;
  uid: string;
  authorName: string;
  authorPhotoDataUrl: string;
  text: string;
  createdAt?: Timestamp;
};

type CommunityCommentLikeDocument = {
  postId: string;
  commentId: string;
  uid: string;
  authorName: string;
  authorPhotoDataUrl: string;
  createdAt?: Timestamp;
};

type CommunityLikeDocument = {
  postId: string;
  uid: string;
  authorName: string;
  authorPhotoDataUrl: string;
  createdAt?: Timestamp;
};

const communityPostConverter: FirestoreDataConverter<CommunityPostDocument> = {
  toFirestore(value: CommunityPostDocument) {
    return value;
  },
  fromFirestore(snapshot) {
    const data = snapshot.data();
    return {
      uid: typeof data.uid === "string" ? data.uid : "",
      authorName: typeof data.authorName === "string" ? data.authorName : "",
      authorPhotoDataUrl:
        typeof data.authorPhotoDataUrl === "string" ? data.authorPhotoDataUrl : "",
      caption: typeof data.caption === "string" ? data.caption : "",
      progressPhotoDataUrl:
        typeof data.progressPhotoDataUrl === "string" ? data.progressPhotoDataUrl : "",
      progressPhotoDataUrls: normalizePhotoDataUrls(data.progressPhotoDataUrls, data.progressPhotoDataUrl),
      createdAt: data.createdAt,
    };
  },
};

const communityPostsCollection = collection(db, "communityPosts").withConverter(communityPostConverter);
const communityCommentsCollection = collection(db, "communityComments").withConverter({
  toFirestore(value: CommunityCommentDocument) {
    return value;
  },
  fromFirestore(snapshot) {
    const data = snapshot.data();
    return {
      postId: typeof data.postId === "string" ? data.postId : "",
      postOwnerUid: typeof data.postOwnerUid === "string" ? data.postOwnerUid : "",
      parentCommentId: typeof data.parentCommentId === "string" ? data.parentCommentId : "",
      uid: typeof data.uid === "string" ? data.uid : "",
      authorName: typeof data.authorName === "string" ? data.authorName : "",
      authorPhotoDataUrl: typeof data.authorPhotoDataUrl === "string" ? data.authorPhotoDataUrl : "",
      text: typeof data.text === "string" ? data.text : "",
      createdAt: data.createdAt,
    };
  },
} satisfies FirestoreDataConverter<CommunityCommentDocument>);
const communityCommentLikesCollection = collection(db, "communityCommentLikes").withConverter({
  toFirestore(value: CommunityCommentLikeDocument) {
    return value;
  },
  fromFirestore(snapshot) {
    const data = snapshot.data();
    return {
      postId: typeof data.postId === "string" ? data.postId : "",
      commentId: typeof data.commentId === "string" ? data.commentId : "",
      uid: typeof data.uid === "string" ? data.uid : "",
      authorName: typeof data.authorName === "string" ? data.authorName : "",
      authorPhotoDataUrl: typeof data.authorPhotoDataUrl === "string" ? data.authorPhotoDataUrl : "",
      createdAt: data.createdAt,
    };
  },
} satisfies FirestoreDataConverter<CommunityCommentLikeDocument>);
const communityLikesCollection = collection(db, "communityLikes").withConverter({
  toFirestore(value: CommunityLikeDocument) {
    return value;
  },
  fromFirestore(snapshot) {
    const data = snapshot.data();
    return {
      postId: typeof data.postId === "string" ? data.postId : "",
      uid: typeof data.uid === "string" ? data.uid : "",
      authorName: typeof data.authorName === "string" ? data.authorName : "",
      authorPhotoDataUrl: typeof data.authorPhotoDataUrl === "string" ? data.authorPhotoDataUrl : "",
      createdAt: data.createdAt,
    };
  },
} satisfies FirestoreDataConverter<CommunityLikeDocument>);

const mapCommunityComment = (
  documentId: string,
  data: CommunityCommentDocument,
): CommunityComment => ({
  id: documentId,
  postId: data.postId,
  postOwnerUid: data.postOwnerUid,
  parentCommentId: data.parentCommentId?.trim() ? data.parentCommentId.trim() : null,
  uid: data.uid,
  authorName: data.authorName,
  authorPhotoDataUrl: data.authorPhotoDataUrl,
  text: data.text,
  createdAt: data.createdAt ?? null,
});

const mapCommunityLike = (
  documentId: string,
  data: CommunityLikeDocument,
): CommunityLike => ({
  id: documentId,
  postId: data.postId,
  uid: data.uid,
  authorName: data.authorName,
  authorPhotoDataUrl: data.authorPhotoDataUrl,
  createdAt: data.createdAt ?? null,
});

const buildCommunityLikeId = (postId: string, uid: string): string =>
  `${encodeURIComponent(postId.trim())}__${encodeURIComponent(uid.trim())}`;
const buildCommunityCommentLikeId = (commentId: string, uid: string): string =>
  `${encodeURIComponent(commentId.trim())}__${encodeURIComponent(uid.trim())}`;

export const createCommunityPost = async (input: {
  uid: string;
  authorName: string;
  authorPhotoDataUrl: string;
  caption: string;
  progressPhotoDataUrls: string[];
}): Promise<void> => {
  const progressPhotoDataUrls = input.progressPhotoDataUrls.map((entry) => entry.trim()).filter(Boolean);

  await addDoc(communityPostsCollection, {
    uid: input.uid,
    authorName: input.authorName,
    authorPhotoDataUrl: input.authorPhotoDataUrl,
    caption: input.caption,
    progressPhotoDataUrl: progressPhotoDataUrls[0] || "",
    progressPhotoDataUrls,
    createdAt: serverTimestamp(),
  });
};

export const getCommunityPostPhotoDataUrls = (
  post: Pick<CommunityPost, "progressPhotoDataUrl" | "progressPhotoDataUrls">,
): string[] => {
  if (post.progressPhotoDataUrls.length > 0) {
    return post.progressPhotoDataUrls;
  }

  return post.progressPhotoDataUrl.trim() ? [post.progressPhotoDataUrl.trim()] : [];
};

export const listCommunityPosts = async (maxItems = 30): Promise<CommunityPost[]> => {
  const postsQuery = query(communityPostsCollection, orderBy("createdAt", "desc"), limit(maxItems));
  const snapshot = await getDocs(postsQuery);

  return snapshot.docs.map((docSnapshot) => {
    const data = docSnapshot.data();
    return {
      id: docSnapshot.id,
      uid: data.uid,
      authorName: data.authorName,
      authorPhotoDataUrl: data.authorPhotoDataUrl,
      caption: data.caption,
      progressPhotoDataUrl: data.progressPhotoDataUrl,
      progressPhotoDataUrls: data.progressPhotoDataUrls ?? [],
      createdAt: data.createdAt ?? null,
    };
  });
};

export const getCommunityPostById = async (postId: string): Promise<CommunityPost | null> => {
  const cleanedPostId = postId.trim();
  if (!cleanedPostId) return null;

  const snapshot = await getDoc(doc(db, "communityPosts", cleanedPostId).withConverter(communityPostConverter));
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  return {
    id: snapshot.id,
    uid: data.uid,
    authorName: data.authorName,
    authorPhotoDataUrl: data.authorPhotoDataUrl,
    caption: data.caption,
    progressPhotoDataUrl: data.progressPhotoDataUrl,
    progressPhotoDataUrls: data.progressPhotoDataUrls ?? [],
    createdAt: data.createdAt ?? null,
  };
};

export const subscribeCommunityPosts = (
  onData: (posts: CommunityPost[]) => void,
  onError?: (error: Error) => void,
  maxItems = 30,
): Unsubscribe => {
  const postsQuery = query(communityPostsCollection, orderBy("createdAt", "desc"), limit(maxItems));

  return onSnapshot(
    postsQuery,
    (snapshot) => {
      onData(
        snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data();
          return {
            id: docSnapshot.id,
            uid: data.uid,
            authorName: data.authorName,
            authorPhotoDataUrl: data.authorPhotoDataUrl,
            caption: data.caption,
            progressPhotoDataUrl: data.progressPhotoDataUrl,
            progressPhotoDataUrls: data.progressPhotoDataUrls ?? [],
            createdAt: data.createdAt ?? null,
          };
        }),
      );
    },
    (error) => {
      onError?.(error);
    },
  );
};

export const listCommunityPostsByUser = async (
  uid: string,
  maxItems = 20,
): Promise<CommunityPost[]> => {
  const postsQuery = query(communityPostsCollection, where("uid", "==", uid), limit(Math.max(maxItems, 50)));
  const snapshot = await getDocs(postsQuery);

  return snapshot.docs
    .map((docSnapshot) => {
      const data = docSnapshot.data();
      return {
        id: docSnapshot.id,
        uid: data.uid,
        authorName: data.authorName,
        authorPhotoDataUrl: data.authorPhotoDataUrl,
        caption: data.caption,
        progressPhotoDataUrl: data.progressPhotoDataUrl,
        progressPhotoDataUrls: data.progressPhotoDataUrls ?? [],
        createdAt: data.createdAt ?? null,
      };
    })
    .sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() ?? 0;
      const bTime = b.createdAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    })
    .slice(0, maxItems);
};

export const updateCommunityPostCaption = async (postId: string, caption: string): Promise<void> => {
  const postRef = doc(db, "communityPosts", postId);
  await updateDoc(postRef, { caption });
};

export const deleteCommunityPost = async (postId: string): Promise<void> => {
  const commentsSnapshot = await getDocs(
    query(communityCommentsCollection, where("postId", "==", postId), limit(500)),
  );

  const likesSnapshot = await getDocs(
    query(communityLikesCollection, where("postId", "==", postId), limit(1000)),
  );

  // Keep post deletion reliable even if some child cleanup operations fail on older rulesets.
  await Promise.allSettled([
    ...commentsSnapshot.docs.map((commentDocument) => deleteDoc(commentDocument.ref)),
    ...likesSnapshot.docs.map((likeDocument) => deleteDoc(likeDocument.ref)),
  ]);

  const postRef = doc(db, "communityPosts", postId);
  await deleteDoc(postRef);
};

export const likeCommunityPost = async (input: {
  postId: string;
  uid: string;
  authorName: string;
  authorPhotoDataUrl: string;
}): Promise<void> => {
  const postId = input.postId.trim();
  const uid = input.uid.trim();
  if (!postId || !uid) return;

  const likeId = buildCommunityLikeId(postId, uid);
  const likeRef = doc(communityLikesCollection, likeId);

  await setDoc(likeRef, {
    postId,
    uid,
    authorName: input.authorName.trim() || "Arc User",
    authorPhotoDataUrl: input.authorPhotoDataUrl.trim(),
    createdAt: serverTimestamp(),
  });
};

export const unlikeCommunityPost = async (postId: string, uid: string): Promise<void> => {
  const cleanedPostId = postId.trim();
  const cleanedUid = uid.trim();
  if (!cleanedPostId || !cleanedUid) return;

  const likeId = buildCommunityLikeId(cleanedPostId, cleanedUid);
  await deleteDoc(doc(db, "communityLikes", likeId));
};

export const getCommunityLikeSummaryForPost = async (
  postId: string,
  viewerUid?: string | null,
): Promise<{ count: number; viewerLiked: boolean }> => {
  const cleanedPostId = postId.trim();
  if (!cleanedPostId) return { count: 0, viewerLiked: false };

  const countSnapshot = await getCountFromServer(
    query(communityLikesCollection, where("postId", "==", cleanedPostId)),
  );
  const count = countSnapshot.data().count;

  if (!viewerUid?.trim()) {
    return { count, viewerLiked: false };
  }

  const likeId = buildCommunityLikeId(cleanedPostId, viewerUid);
  const viewerLikeSnapshot = await getDoc(doc(db, "communityLikes", likeId));
  return { count, viewerLiked: viewerLikeSnapshot.exists() };
};

export const listCommunityLikeSummariesForPosts = async (
  postIds: string[],
  viewerUid?: string | null,
): Promise<{ counts: Record<string, number>; likedByViewer: Record<string, boolean> }> => {
  const cleanedPostIds = Array.from(new Set(postIds.map((postId) => postId.trim()).filter(Boolean)));
  if (cleanedPostIds.length === 0) return { counts: {}, likedByViewer: {} };

  const countRows = await Promise.all(
    cleanedPostIds.map(async (postId) => {
      const countSnapshot = await getCountFromServer(
        query(communityLikesCollection, where("postId", "==", postId)),
      );
      return [postId, countSnapshot.data().count] as const;
    }),
  );

  const counts = Object.fromEntries(countRows);
  const likedByViewer: Record<string, boolean> = {};

  if (viewerUid?.trim()) {
    const viewerRows = await Promise.all(
      cleanedPostIds.map(async (postId) => {
        const likeId = buildCommunityLikeId(postId, viewerUid);
        const snapshot = await getDoc(doc(db, "communityLikes", likeId));
        return [postId, snapshot.exists()] as const;
      }),
    );
    for (const [postId, liked] of viewerRows) {
      likedByViewer[postId] = liked;
    }
  }

  return { counts, likedByViewer };
};

export const listCommunityLikesForPost = async (
  postId: string,
  maxItems = 80,
): Promise<CommunityLike[]> => {
  const cleanedPostId = postId.trim();
  if (!cleanedPostId) return [];

  const likesQuery = query(
    communityLikesCollection,
    where("postId", "==", cleanedPostId),
    limit(Math.max(1, maxItems)),
  );
  const snapshot = await getDocs(likesQuery);
  return snapshot.docs
    .map((docSnapshot) => mapCommunityLike(docSnapshot.id, docSnapshot.data()))
    .sort((left, right) => {
      const leftTime = left.createdAt?.toMillis?.() ?? 0;
      const rightTime = right.createdAt?.toMillis?.() ?? 0;
      return rightTime - leftTime;
    });
};

export const deleteCommunityComment = async (commentId: string): Promise<void> => {
  const cleanedCommentId = commentId.trim();
  if (!cleanedCommentId) return;

  const targetIds = new Set<string>([cleanedCommentId]);
  try {
    const repliesSnapshot = await getDocs(
      query(communityCommentsCollection, where("parentCommentId", "==", cleanedCommentId), limit(500)),
    );
    for (const replyDocument of repliesSnapshot.docs) {
      targetIds.add(replyDocument.id);
    }
  } catch {
    // Fallback to deleting only the requested comment when reply lookup fails.
  }

  await Promise.allSettled(
    Array.from(targetIds).map((targetId) => deleteDoc(doc(db, "communityComments", targetId))),
  );

  for (const targetId of targetIds) {
    try {
      const likesSnapshot = await getDocs(
        query(communityCommentLikesCollection, where("commentId", "==", targetId), limit(500)),
      );
      await Promise.allSettled(likesSnapshot.docs.map((likeDocument) => deleteDoc(likeDocument.ref)));
    } catch {
      // Comment deletion should succeed even when comment-like cleanup cannot run.
    }
  }
};

export const listCommunityCommentsForPosts = async (
  postIds: string[],
): Promise<Record<string, CommunityComment[]>> => {
  const cleanedPostIds = Array.from(new Set(postIds.map((postId) => postId.trim()).filter(Boolean)));
  if (cleanedPostIds.length === 0) return {};

  const grouped = new Map<string, CommunityComment[]>();

  for (let index = 0; index < cleanedPostIds.length; index += 10) {
    const chunk = cleanedPostIds.slice(index, index + 10);
    const snapshot = await getDocs(
      query(communityCommentsCollection, where("postId", "in", chunk), limit(500)),
    );

    for (const document of snapshot.docs) {
      const comment = mapCommunityComment(document.id, document.data());
      const existing = grouped.get(comment.postId) || [];
      existing.push(comment);
      grouped.set(comment.postId, existing);
    }
  }

  return Object.fromEntries(
    Array.from(grouped.entries()).map(([postId, comments]) => [
      postId,
      comments.sort((left, right) => {
        const leftTime = left.createdAt?.toMillis?.() ?? 0;
        const rightTime = right.createdAt?.toMillis?.() ?? 0;
        return leftTime - rightTime;
      }),
    ]),
  );
};

export const listCommunityCommentCountsForPosts = async (
  postIds: string[],
): Promise<Record<string, number>> => {
  const cleanedPostIds = Array.from(new Set(postIds.map((postId) => postId.trim()).filter(Boolean)));
  if (cleanedPostIds.length === 0) return {};

  const counts = await Promise.all(
    cleanedPostIds.map(async (postId) => {
      const countSnapshot = await getCountFromServer(
        query(communityCommentsCollection, where("postId", "==", postId)),
      );
      return [postId, countSnapshot.data().count] as const;
    }),
  );

  return Object.fromEntries(counts);
};

export const createCommunityComment = async (input: {
  postId: string;
  postOwnerUid: string;
  parentCommentId?: string | null;
  uid: string;
  authorName: string;
  authorPhotoDataUrl: string;
  text: string;
  postCaption: string;
}): Promise<void> => {
  await addDoc(communityCommentsCollection, {
    postId: input.postId,
    postOwnerUid: input.postOwnerUid,
    parentCommentId: input.parentCommentId?.trim() || "",
    uid: input.uid,
    authorName: input.authorName,
    authorPhotoDataUrl: input.authorPhotoDataUrl,
    text: input.text,
    createdAt: serverTimestamp(),
  });

  if (input.postOwnerUid && input.postOwnerUid !== input.uid) {
    try {
      await createUserNotification({
        type: "comment",
        recipientUid: input.postOwnerUid,
        actorUid: input.uid,
        actorName: input.authorName,
        actorPhotoDataUrl: input.authorPhotoDataUrl,
        postId: input.postId,
        postCaption: input.postCaption,
        commentText: input.text,
      });
    } catch {
      // Comment creation should still succeed if notification rules lag behind.
    }
  }
};

export const likeCommunityComment = async (input: {
  postId: string;
  commentId: string;
  uid: string;
  authorName: string;
  authorPhotoDataUrl: string;
}): Promise<void> => {
  const postId = input.postId.trim();
  const commentId = input.commentId.trim();
  const uid = input.uid.trim();
  if (!postId || !commentId || !uid) return;

  const likeId = buildCommunityCommentLikeId(commentId, uid);
  const likeRef = doc(communityCommentLikesCollection, likeId);

  await setDoc(likeRef, {
    postId,
    commentId,
    uid,
    authorName: input.authorName.trim() || "Arc User",
    authorPhotoDataUrl: input.authorPhotoDataUrl.trim(),
    createdAt: serverTimestamp(),
  });
};

export const unlikeCommunityComment = async (commentId: string, uid: string): Promise<void> => {
  const cleanedCommentId = commentId.trim();
  const cleanedUid = uid.trim();
  if (!cleanedCommentId || !cleanedUid) return;

  const likeId = buildCommunityCommentLikeId(cleanedCommentId, cleanedUid);
  await deleteDoc(doc(db, "communityCommentLikes", likeId));
};

export const listCommunityCommentLikeSummaries = async (
  commentIds: string[],
  viewerUid?: string | null,
): Promise<{ counts: Record<string, number>; likedByViewer: Record<string, boolean> }> => {
  const cleanedCommentIds = Array.from(new Set(commentIds.map((commentId) => commentId.trim()).filter(Boolean)));
  if (cleanedCommentIds.length === 0) return { counts: {}, likedByViewer: {} };

  const countRows = await Promise.all(
    cleanedCommentIds.map(async (commentId) => {
      const countSnapshot = await getCountFromServer(
        query(communityCommentLikesCollection, where("commentId", "==", commentId)),
      );
      return [commentId, countSnapshot.data().count] as const;
    }),
  );

  const counts = Object.fromEntries(countRows);
  const likedByViewer: Record<string, boolean> = {};

  if (viewerUid?.trim()) {
    const viewerRows = await Promise.all(
      cleanedCommentIds.map(async (commentId) => {
        const likeId = buildCommunityCommentLikeId(commentId, viewerUid);
        const snapshot = await getDoc(doc(db, "communityCommentLikes", likeId));
        return [commentId, snapshot.exists()] as const;
      }),
    );
    for (const [commentId, liked] of viewerRows) {
      likedByViewer[commentId] = liked;
    }
  }

  return { counts, likedByViewer };
};
