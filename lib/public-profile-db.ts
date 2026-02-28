import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  type QuerySnapshot,
  type FirestoreDataConverter,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { UserProfile } from "@/lib/profile-db";

export type PublicUserProfile = {
  uid: string;
  username: string;
  bio: string;
  workoutSplit: string;
  photoDataUrl: string;
};

type PublicUserProfileDocument = Omit<PublicUserProfile, "uid"> & {
  updatedAt?: Timestamp;
};

const publicProfileConverter: FirestoreDataConverter<PublicUserProfileDocument> = {
  toFirestore(value: PublicUserProfileDocument) {
    return value;
  },
  fromFirestore(snapshot) {
    const data = snapshot.data();
    return {
      username: typeof data.username === "string" ? data.username : "",
      bio: typeof data.bio === "string" ? data.bio : "",
      workoutSplit: typeof data.workoutSplit === "string" ? data.workoutSplit : "",
      photoDataUrl:
        typeof data.photoDataUrl === "string"
          ? data.photoDataUrl
          : typeof data.photoURL === "string"
            ? data.photoURL
            : "",
      updatedAt: data.updatedAt,
    };
  },
};

const publicProfileRef = (uid: string) =>
  doc(db, "publicProfiles", uid).withConverter(publicProfileConverter);
const publicProfilesCollection = collection(db, "publicProfiles").withConverter(publicProfileConverter);

const mapPublicProfilesSnapshot = (
  snapshot: QuerySnapshot<PublicUserProfileDocument>,
): PublicUserProfile[] =>
  snapshot.docs
    .map((document) => {
      const data = document.data();
      return {
        uid: document.id,
        username: data.username.trim(),
        bio: data.bio,
        workoutSplit: data.workoutSplit,
        photoDataUrl: data.photoDataUrl,
      };
    })
    .filter((profile) => Boolean(profile.username));

export const loadPublicUserProfile = async (uid: string): Promise<PublicUserProfile | null> => {
  const snapshot = await getDoc(publicProfileRef(uid));
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  return {
    uid,
    username: data.username,
    bio: data.bio,
    workoutSplit: data.workoutSplit,
    photoDataUrl: data.photoDataUrl,
  };
};

export const savePublicUserProfile = async (uid: string, profile: UserProfile): Promise<void> => {
  await setDoc(
    publicProfileRef(uid),
    {
      username: profile.username,
      bio: profile.bio,
      workoutSplit: profile.workoutSplit,
      photoDataUrl: profile.photoDataUrl,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const listPublicUserProfiles = async (maxItems = 300): Promise<PublicUserProfile[]> => {
  const snapshot = await getDocs(query(publicProfilesCollection, limit(maxItems)));
  return mapPublicProfilesSnapshot(snapshot);
};

export const subscribePublicUserProfiles = (
  onData: (profiles: PublicUserProfile[]) => void,
  onError?: (error: Error) => void,
  maxItems = 300,
): Unsubscribe => {
  const publicProfilesQuery = query(publicProfilesCollection, limit(maxItems));

  return onSnapshot(
    publicProfilesQuery,
    (snapshot) => {
      onData(mapPublicProfilesSnapshot(snapshot));
    },
    (error) => {
      onError?.(error);
    },
  );
};
