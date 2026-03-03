import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import type { ActiveNutritionPlan } from "@/types/nutrition";

type NutritionDocument = ActiveNutritionPlan & {
  updatedAt?: Timestamp;
};

const nutritionRef = async (uid: string) => {
  const db = await getAdminDb();
  return db.collection("users").doc(uid).collection("nutrition").doc("active");
};

export const loadActiveNutritionPlan = async (uid: string): Promise<ActiveNutritionPlan | null> => {
  const snapshot = await (await nutritionRef(uid)).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() as NutritionDocument | undefined;
  if (!data) return null;
  const plan = { ...data };
  delete plan.updatedAt;
  return plan;
};

export const saveActiveNutritionPlan = async (uid: string, plan: ActiveNutritionPlan): Promise<void> => {
  await (await nutritionRef(uid)).set(
    {
      ...plan,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
};
