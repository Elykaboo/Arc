import {
  collection,
  collectionGroup,
  deleteDoc,
  documentId,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type FirestoreDataConverter,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export type FollowingUser = {
  uid: string;
  username: string;
  photoDataUrl: string;
};

type FollowingUserDocument = Omit<FollowingUser, "uid"> & {
  createdAt?: Timestamp;
};

export type FollowerUser = {
  uid: string;
  username: string;
  photoDataUrl: string;
};

export type FollowerEntry = FollowerUser & {
  createdAtMs: number | null;
};

export type FollowGraphUser = {
  uid: string;
  username: string;
  photoDataUrl: string;
};

type FollowerUserDocument = Omit<FollowerUser, "uid"> & {
  createdAt?: Timestamp;
};

const followingUserConverter: FirestoreDataConverter<FollowingUserDocument> = {
  toFirestore(value: FollowingUserDocument) {
    return value;
  },
  fromFirestore(snapshot) {
    const data = snapshot.data();
    return {
      username: typeof data.username === "string" ? data.username : "",
      photoDataUrl: typeof data.photoDataUrl === "string" ? data.photoDataUrl : "",
      createdAt: data.createdAt,
    };
  },
};

const followerUserConverter: FirestoreDataConverter<FollowerUserDocument> = {
  toFirestore(value: FollowerUserDocument) {
    return value;
  },
  fromFirestore(snapshot) {
    const data = snapshot.data();
    return {
      username: typeof data.username === "string" ? data.username : "",
      photoDataUrl: typeof data.photoDataUrl === "string" ? data.photoDataUrl : "",
      createdAt: data.createdAt,
    };
  },
};

const followingRef = (viewerUid: string, targetUid: string) =>
  doc(db, "users", viewerUid, "following", targetUid).withConverter(followingUserConverter);

const followingCollection = (viewerUid: string) =>
  collection(db, "users", viewerUid, "following").withConverter(followingUserConverter);

const followerRef = (targetUid: string, viewerUid: string) =>
  doc(db, "users", targetUid, "followers", viewerUid).withConverter(followerUserConverter);

const followersCollection = (targetUid: string) =>
  collection(db, "users", targetUid, "followers").withConverter(followerUserConverter);

export const followUser = async (
  viewerUid: string,
  targetUser: FollowingUser,
  viewerProfile?: { username?: string; photoDataUrl?: string },
): Promise<void> => {
  await setDoc(
    followingRef(viewerUid, targetUser.uid),
    {
      username: targetUser.username.trim(),
      photoDataUrl: targetUser.photoDataUrl.trim(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  try {
    await setDoc(
      followerRef(targetUser.uid, viewerUid),
      {
        username: viewerProfile?.username?.trim() || "",
        photoDataUrl: viewerProfile?.photoDataUrl?.trim() || "",
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch {
    // Follower mirror can fail when rules are older; keep following relation successful.
  }
};

export const unfollowUser = async (viewerUid: string, targetUid: string): Promise<void> => {
  await deleteDoc(followingRef(viewerUid, targetUid));
  try {
    await deleteDoc(followerRef(targetUid, viewerUid));
  } catch {
    // Ignore follower mirror cleanup failures for backward compatibility.
  }
};

export const isFollowingUser = async (viewerUid: string, targetUid: string): Promise<boolean> => {
  const snapshot = await getDoc(followingRef(viewerUid, targetUid));
  return snapshot.exists();
};

export const listFollowingUsers = async (viewerUid: string, maxItems = 500): Promise<FollowingUser[]> => {
  const snapshot = await getDocs(query(followingCollection(viewerUid), limit(maxItems)));

  return snapshot.docs.map((document) => {
    const data = document.data();
    return {
      uid: document.id,
      username: data.username,
      photoDataUrl: data.photoDataUrl,
    };
  });
};

export const countFollowersForUser = async (targetUid: string, maxItems = 2000): Promise<number> => {
  try {
    const followersQuery = query(followersCollection(targetUid), limit(maxItems));
    const snapshot = await getDocs(followersQuery);
    return snapshot.size;
  } catch {
    const legacyFollowersQuery = query(
      collectionGroup(db, "following"),
      where(documentId(), "==", targetUid),
      limit(maxItems),
    );
    const snapshot = await getDocs(legacyFollowersQuery);
    return snapshot.size;
  }
};

export const listFollowersForUser = async (
  targetUid: string,
  maxItems = 100,
): Promise<FollowerEntry[]> => {
  const followersQuery = query(
    followersCollection(targetUid),
    orderBy("createdAt", "desc"),
    limit(maxItems),
  );
  const snapshot = await getDocs(followersQuery);

  return snapshot.docs.map((document) => {
    const data = document.data();
    return {
      uid: document.id,
      username: data.username,
      photoDataUrl: data.photoDataUrl,
      createdAtMs: data.createdAt ? data.createdAt.toMillis() : null,
    };
  });
};

export const listUsersFromFollowGraph = async (maxItems = 2000): Promise<FollowGraphUser[]> => {
  const usersById = new Map<string, FollowGraphUser>();

  try {
    const followingSnapshot = await getDocs(query(collectionGroup(db, "following"), limit(maxItems)));
    for (const document of followingSnapshot.docs) {
      const data = document.data();
      const targetUid = document.id;
      const sourceUid = document.ref.parent.parent?.id || "";

      if (targetUid) {
        usersById.set(targetUid, {
          uid: targetUid,
          username: typeof data.username === "string" ? data.username.trim() : "",
          photoDataUrl: typeof data.photoDataUrl === "string" ? data.photoDataUrl.trim() : "",
        });
      }

      if (sourceUid && !usersById.has(sourceUid)) {
        usersById.set(sourceUid, {
          uid: sourceUid,
          username: "",
          photoDataUrl: "",
        });
      }
    }
  } catch {
    // Ignore follow graph fallbacks when the query is unavailable.
  }

  try {
    const followersSnapshot = await getDocs(query(collectionGroup(db, "followers"), limit(maxItems)));
    for (const document of followersSnapshot.docs) {
      const data = document.data();
      const viewerUid = document.id;
      const targetUid = document.ref.parent.parent?.id || "";

      if (viewerUid) {
        const existingViewer = usersById.get(viewerUid);
        usersById.set(viewerUid, {
          uid: viewerUid,
          username: existingViewer?.username || (typeof data.username === "string" ? data.username.trim() : ""),
          photoDataUrl:
            existingViewer?.photoDataUrl || (typeof data.photoDataUrl === "string" ? data.photoDataUrl.trim() : ""),
        });
      }

      if (targetUid && !usersById.has(targetUid)) {
        usersById.set(targetUid, {
          uid: targetUid,
          username: "",
          photoDataUrl: "",
        });
      }
    }
  } catch {
    // Ignore follower graph fallbacks when the query is unavailable.
  }

  return Array.from(usersById.values());
};
