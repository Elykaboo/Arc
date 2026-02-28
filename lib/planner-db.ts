import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type FirestoreDataConverter,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type PlannerDocument = {
  draft: Record<string, unknown> | null;
  updatedAt?: Timestamp;
};

const plannerConverter: FirestoreDataConverter<PlannerDocument> = {
  toFirestore(value: PlannerDocument) {
    return value;
  },
  fromFirestore(snapshot) {
    const data = snapshot.data();
    return {
      draft: data.draft,
      updatedAt: data.updatedAt,
    };
  },
};

const plannerRef = (uid: string) =>
  doc(db, "users", uid, "planner", "weekly").withConverter(plannerConverter);

export const loadPlannerDraft = async (uid: string): Promise<Record<string, unknown> | null> => {
  const snapshot = await getDoc(plannerRef(uid));
  if (!snapshot.exists()) return null;
  return snapshot.data().draft ?? null;
};

export const savePlannerDraft = async (
  uid: string,
  draft: Record<string, unknown> | null,
): Promise<void> => {
  await setDoc(
    plannerRef(uid),
    {
      draft,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};
