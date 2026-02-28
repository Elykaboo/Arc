import {
  addDoc,
  collection,
  deleteDoc,
  doc,
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

export type CommunityPost = {
  id: string;
  uid: string;
  authorName: string;
  authorPhotoDataUrl: string;
  caption: string;
  progressPhotoDataUrl: string;
  createdAt: Timestamp | null;
};

type CommunityPostDocument = {
  uid: string;
  authorName: string;
  authorPhotoDataUrl: string;
  caption: string;
  progressPhotoDataUrl: string;
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
      createdAt: data.createdAt,
    };
  },
};

const communityPostsCollection = collection(db, "communityPosts").withConverter(communityPostConverter);

export const createCommunityPost = async (input: {
  uid: string;
  authorName: string;
  authorPhotoDataUrl: string;
  caption: string;
  progressPhotoDataUrl: string;
}): Promise<void> => {
  await addDoc(communityPostsCollection, {
    uid: input.uid,
    authorName: input.authorName,
    authorPhotoDataUrl: input.authorPhotoDataUrl,
    caption: input.caption,
    progressPhotoDataUrl: input.progressPhotoDataUrl,
    createdAt: serverTimestamp(),
  });
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
      createdAt: data.createdAt ?? null,
    };
  });
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
  const postRef = doc(db, "communityPosts", postId);
  await deleteDoc(postRef);
};
