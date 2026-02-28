import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type FirestoreDataConverter,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export type UserProfile = {
  username: string;
  gender: string;
  bio: string;
  workoutSplit: string;
  photoDataUrl: string;
};

type UserProfileDocument = UserProfile & {
  updatedAt?: Timestamp;
};

const profileConverter: FirestoreDataConverter<UserProfileDocument> = {
  toFirestore(value: UserProfileDocument) {
    return value;
  },
  fromFirestore(snapshot) {
    const data = snapshot.data();
    return {
      username: typeof data.username === "string" ? data.username : "",
      gender: typeof data.gender === "string" ? data.gender : "",
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

const profileRef = (uid: string) =>
  doc(db, "users", uid, "profile", "details").withConverter(profileConverter);

export const loadUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const snapshot = await getDoc(profileRef(uid));
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  return {
    username: data.username,
    gender: data.gender,
    bio: data.bio,
    workoutSplit: data.workoutSplit,
    photoDataUrl: data.photoDataUrl,
  };
};

export const saveUserProfile = async (uid: string, profile: UserProfile): Promise<void> => {
  await setDoc(
    profileRef(uid),
    {
      ...profile,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};
