import {
  collectionGroup,
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

export type UserProfile = {
  username: string;
  sex: "male" | "female" | "other" | "";
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: "sedentary" | "light" | "moderate" | "active" | "very_active" | "";
  nutritionGoal: "lose" | "maintain" | "gain" | "";
  dailyCalorieOverride: number | null;
  mealsPerDay: number | null;
  bio: string;
  workoutSplit: string;
  photoDataUrl: string;
};

export type SearchableUserProfile = {
  uid: string;
  username: string;
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
      sex:
        data.sex === "male" || data.sex === "female" || data.sex === "other"
          ? data.sex
          : "",
      age: typeof data.age === "number" ? data.age : null,
      heightCm: typeof data.heightCm === "number" ? data.heightCm : null,
      weightKg: typeof data.weightKg === "number" ? data.weightKg : null,
      activityLevel:
        data.activityLevel === "sedentary" ||
        data.activityLevel === "light" ||
        data.activityLevel === "moderate" ||
        data.activityLevel === "active" ||
        data.activityLevel === "very_active"
          ? data.activityLevel
          : "",
      nutritionGoal:
        data.nutritionGoal === "lose" ||
        data.nutritionGoal === "maintain" ||
        data.nutritionGoal === "gain"
          ? data.nutritionGoal
          : "",
      dailyCalorieOverride:
        typeof data.dailyCalorieOverride === "number" ? data.dailyCalorieOverride : null,
      mealsPerDay: typeof data.mealsPerDay === "number" ? data.mealsPerDay : null,
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
const profileCollectionGroup = collectionGroup(db, "profile").withConverter(profileConverter);

const mapSearchableProfilesSnapshot = (
  snapshot: QuerySnapshot<UserProfileDocument>,
): SearchableUserProfile[] =>
  snapshot.docs
    .map((document) => {
      if (document.id !== "details") return null;

      const uid = document.ref.parent.parent?.id || "";
      const data = document.data();
      const username = data.username.trim();

      if (!uid || !username) return null;

      return {
        uid,
        username,
        bio: data.bio.trim(),
        workoutSplit: data.workoutSplit.trim(),
        photoDataUrl: data.photoDataUrl,
      };
    })
    .filter((profile): profile is SearchableUserProfile => Boolean(profile));

export const loadUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const snapshot = await getDoc(profileRef(uid));
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  return {
    username: data.username,
    sex: data.sex,
    age: data.age,
    heightCm: data.heightCm,
    weightKg: data.weightKg,
    activityLevel: data.activityLevel,
    nutritionGoal: data.nutritionGoal,
    dailyCalorieOverride: data.dailyCalorieOverride,
    mealsPerDay: data.mealsPerDay,
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

export const listSearchableUserProfiles = async (maxItems = 500): Promise<SearchableUserProfile[]> => {
  const snapshot = await getDocs(query(profileCollectionGroup, limit(maxItems)));
  return mapSearchableProfilesSnapshot(snapshot);
};

export const subscribeSearchableUserProfiles = (
  onData: (profiles: SearchableUserProfile[]) => void,
  onError?: (error: Error) => void,
  maxItems = 500,
): Unsubscribe => {
  const searchableProfilesQuery = query(profileCollectionGroup, limit(maxItems));

  return onSnapshot(
    searchableProfilesQuery,
    (snapshot) => {
      onData(mapSearchableProfilesSnapshot(snapshot));
    },
    (error) => {
      onError?.(error);
    },
  );
};
