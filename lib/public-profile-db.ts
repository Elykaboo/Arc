import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  type FirestoreDataConverter,
  type Timestamp,
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

  return snapshot.docs
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
};
