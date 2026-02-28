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
  type FirestoreDataConverter,
  type QuerySnapshot,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { UserProfile } from "@/lib/profile-db";

export type MemberProfile = {
  uid: string;
  username: string;
  bio: string;
  workoutSplit: string;
  photoDataUrl: string;
};

type MemberProfileDocument = Omit<MemberProfile, "uid"> & {
  updatedAt?: Timestamp;
};

const memberConverter: FirestoreDataConverter<MemberProfileDocument> = {
  toFirestore(value: MemberProfileDocument) {
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

const memberRef = (uid: string) => doc(db, "members", uid).withConverter(memberConverter);
const membersCollection = collection(db, "members").withConverter(memberConverter);

const mapMembersSnapshot = (snapshot: QuerySnapshot<MemberProfileDocument>): MemberProfile[] =>
  snapshot.docs
    .map((document) => {
      const data = document.data();
      const username = data.username.trim();

      if (!document.id || !username) return null;

      return {
        uid: document.id,
        username,
        bio: data.bio.trim(),
        workoutSplit: data.workoutSplit.trim(),
        photoDataUrl: data.photoDataUrl.trim(),
      };
    })
    .filter((member): member is MemberProfile => Boolean(member));

export const loadMemberProfile = async (uid: string): Promise<MemberProfile | null> => {
  const snapshot = await getDoc(memberRef(uid));
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

export const saveMemberProfile = async (uid: string, profile: UserProfile): Promise<void> => {
  await setDoc(
    memberRef(uid),
    {
      username: profile.username.trim(),
      bio: profile.bio.trim(),
      workoutSplit: profile.workoutSplit.trim(),
      photoDataUrl: profile.photoDataUrl.trim(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const listMemberProfiles = async (maxItems = 3000): Promise<MemberProfile[]> => {
  const snapshot = await getDocs(query(membersCollection, limit(maxItems)));
  return mapMembersSnapshot(snapshot);
};

export const subscribeMemberProfiles = (
  onData: (profiles: MemberProfile[]) => void,
  onError?: (error: Error) => void,
  maxItems = 3000,
): Unsubscribe => {
  const membersQuery = query(membersCollection, limit(maxItems));

  return onSnapshot(
    membersQuery,
    (snapshot) => {
      onData(mapMembersSnapshot(snapshot));
    },
    (error) => {
      onError?.(error);
    },
  );
};
