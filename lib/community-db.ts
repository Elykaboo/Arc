import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
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
  uid: string;
  authorName: string;
  authorPhotoDataUrl: string;
  text: string;
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
  uid: string;
  authorName: string;
  authorPhotoDataUrl: string;
  text: string;
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
      uid: typeof data.uid === "string" ? data.uid : "",
      authorName: typeof data.authorName === "string" ? data.authorName : "",
      authorPhotoDataUrl: typeof data.authorPhotoDataUrl === "string" ? data.authorPhotoDataUrl : "",
      text: typeof data.text === "string" ? data.text : "",
      createdAt: data.createdAt,
    };
  },
} satisfies FirestoreDataConverter<CommunityCommentDocument>);

const mapCommunityComment = (
  documentId: string,
  data: CommunityCommentDocument,
): CommunityComment => ({
  id: documentId,
  postId: data.postId,
  postOwnerUid: data.postOwnerUid,
  uid: data.uid,
  authorName: data.authorName,
  authorPhotoDataUrl: data.authorPhotoDataUrl,
  text: data.text,
  createdAt: data.createdAt ?? null,
});

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
      progressPhotoDataUrls: data.progressPhotoDataUrls,
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
    progressPhotoDataUrls: data.progressPhotoDataUrls,
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
            progressPhotoDataUrls: data.progressPhotoDataUrls,
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
        progressPhotoDataUrls: data.progressPhotoDataUrls,
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

  await Promise.all(commentsSnapshot.docs.map((commentDocument) => deleteDoc(commentDocument.ref)));

  const postRef = doc(db, "communityPosts", postId);
  await deleteDoc(postRef);
};

export const deleteCommunityComment = async (commentId: string): Promise<void> => {
  const cleanedCommentId = commentId.trim();
  if (!cleanedCommentId) return;

  await deleteDoc(doc(db, "communityComments", cleanedCommentId));
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

export const createCommunityComment = async (input: {
  postId: string;
  postOwnerUid: string;
  uid: string;
  authorName: string;
  authorPhotoDataUrl: string;
  text: string;
  postCaption: string;
}): Promise<void> => {
  await addDoc(communityCommentsCollection, {
    postId: input.postId,
    postOwnerUid: input.postOwnerUid,
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
