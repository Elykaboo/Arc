"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { loadPlannerDraft } from "@/lib/planner-db";
import { loadUserProfile, saveUserProfile, type UserProfile } from "@/lib/profile-db";
import { savePublicUserProfile } from "@/lib/public-profile-db";

const defaultProfile: UserProfile = {
  username: "",
  gender: "",
  bio: "",
  workoutSplit: "",
  photoDataUrl: "",
};

type PlannerItem = {
  exerciseId: string;
  templateLabel?: string;
  preferredExerciseName?: string;
};

const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const toSplitToken = (label: string): string => {
  const value = label.trim().toLowerCase();
  if (!value) return "";
  if (value.includes("push")) return "Push";
  if (value.includes("pull")) return "Pull";
  if (value.includes("legs") || value.includes("leg")) return "Legs";
  if (value.includes("upper")) return "Upper";
  if (value.includes("lower")) return "Lower";
  if (value.includes("full body")) return "Full Body";
  if (value.includes("shoulders + arms")) return "Shoulders + Arms";
  if (value.includes("chest + back")) return "Chest + Back";
  if (value.includes("arms")) return "Arms";
  if (value.includes("chest")) return "Chest";
  if (value.includes("back")) return "Back";
  if (value.includes("shoulder")) return "Shoulders";

  const first = label.trim().split(/\s+/)[0] || label.trim();
  return first.charAt(0).toUpperCase() + first.slice(1);
};

const extractPlannerItems = (draft: unknown): PlannerItem[] => {
  if (!draft || typeof draft !== "object") return [];

  const data = draft as Record<string, unknown>;
  const items: PlannerItem[] = [];

  for (const day of weekdays) {
    const dayEntry = data[day];
    if (!dayEntry || typeof dayEntry !== "object") continue;

    const dayData = dayEntry as Record<string, unknown>;
    if (!Array.isArray(dayData.items)) continue;

    for (const rawItem of dayData.items) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const itemData = rawItem as Record<string, unknown>;

      items.push({
        exerciseId: typeof itemData.exerciseId === "string" ? itemData.exerciseId : "",
        templateLabel:
          typeof itemData.templateLabel === "string" ? itemData.templateLabel : undefined,
        preferredExerciseName:
          typeof itemData.preferredExerciseName === "string"
            ? itemData.preferredExerciseName
            : undefined,
      });
    }
  }

  return items;
};

const buildFallbackUsername = (email: string | null | undefined): string => {
  if (!email) return "";
  return email.split("@")[0] || "";
};

const broadcastProfileUpdated = (nextProfile: UserProfile) => {
  window.dispatchEvent(new CustomEvent<UserProfile>("profile-updated", { detail: nextProfile }));
};

export default function ProfileClient() {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const [currentSplitName, setCurrentSplitName] = useState("");
  const [currentSplitExercises, setCurrentSplitExercises] = useState<string[]>([]);
  const [isSplitLoading, setIsSplitLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUserId(user?.uid ?? null);
      setIsAuthResolved(true);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isAuthResolved) return;

    const user = auth.currentUser;
    if (!userId || !user) {
      setProfile(defaultProfile);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setStatus(null);

      const authProfile: UserProfile = {
        username: user.displayName?.trim() || buildFallbackUsername(user.email),
        gender: "",
        bio: "",
        workoutSplit: "",
        photoDataUrl: user.photoURL?.trim() || "",
      };

      try {
        const storedProfile = await loadUserProfile(userId);
        if (cancelled) return;

        const resolvedProfile = {
          username: storedProfile?.username || authProfile.username,
          gender: storedProfile?.gender || "",
          bio: storedProfile?.bio || "",
          workoutSplit: storedProfile?.workoutSplit || "",
          photoDataUrl: storedProfile?.photoDataUrl || authProfile.photoDataUrl,
        };
        setProfile(resolvedProfile);
        void savePublicUserProfile(userId, resolvedProfile);
      } catch {
        if (cancelled) return;
        setProfile(authProfile);
        void savePublicUserProfile(userId, authProfile);
        setStatus({
          type: "error",
          message: "Could not load your profile details right now.",
        });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [isAuthResolved, userId]);

  useEffect(() => {
    if (!isAuthResolved) return;

    if (!userId) {
      setCurrentSplitName("");
      setCurrentSplitExercises([]);
      setIsSplitLoading(false);
      return;
    }

    let cancelled = false;

    const loadSplitSummary = async () => {
      setIsSplitLoading(true);
      try {
        const draft = await loadPlannerDraft(userId);
        if (cancelled) return;

        const items = extractPlannerItems(draft);
        if (items.length === 0) {
          setCurrentSplitName("");
          setCurrentSplitExercises([]);
          setIsSplitLoading(false);
          return;
        }

        const splitTokens = Array.from(
          new Set(items.map((item) => toSplitToken(item.templateLabel || "")).filter(Boolean)),
        );
        const splitLabel =
          splitTokens.length > 0
            ? splitTokens.join(" / ")
            : `${Math.min(weekdays.length, Math.max(1, items.length))}-Day Split`;

        const nameByExerciseId = new Map<string, string>();
        const orderedExerciseNames: string[] = [];

        for (const item of items) {
          if (orderedExerciseNames.length >= 5) break;

          const preferredName = item.preferredExerciseName?.trim();
          if (preferredName) {
            if (!orderedExerciseNames.includes(preferredName)) {
              orderedExerciseNames.push(preferredName);
            }
            continue;
          }

          const exerciseId = item.exerciseId.trim();
          if (!exerciseId || nameByExerciseId.has(exerciseId)) continue;

          try {
            const response = await fetch(`/api/v1/exercises/${exerciseId}`, { cache: "no-store" });
            if (!response.ok) continue;

            const data = (await response.json()) as { name?: string };
            const resolvedName = typeof data.name === "string" ? data.name.trim() : "";
            if (resolvedName) {
              nameByExerciseId.set(exerciseId, resolvedName);
              if (!orderedExerciseNames.includes(resolvedName) && orderedExerciseNames.length < 5) {
                orderedExerciseNames.push(resolvedName);
              }
            }
          } catch {
            // Skip failed exercise lookups and keep rendering the rest of the summary.
          }
        }

        setCurrentSplitName(splitLabel);
        setCurrentSplitExercises(orderedExerciseNames.slice(0, 5));
      } catch {
        if (cancelled) return;
        setCurrentSplitName("");
        setCurrentSplitExercises([]);
      } finally {
        if (!cancelled) setIsSplitLoading(false);
      }
    };

    void loadSplitSummary();

    return () => {
      cancelled = true;
    };
  }, [isAuthResolved, userId]);

  const profilePreviewName = useMemo(() => {
    const trimmed = profile.username.trim();
    return trimmed || "Your Name";
  }, [profile.username]);

  const profilePreviewPhoto = useMemo(() => {
    const trimmed = profile.photoDataUrl.trim();
    return trimmed || null;
  }, [profile.photoDataUrl]);
  const displayedSplitName = currentSplitName || profile.workoutSplit.trim();

  const updateField = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => {
    setProfile((previous) => ({ ...previous, [key]: value }));
  };

  const handlePictureChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setPictureError("Please upload an image file.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setPictureError("Image size must be 2MB or less.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const nextProfile = { ...profile, photoDataUrl: result };
      setProfile(nextProfile);
      broadcastProfileUpdated(nextProfile);
      setPictureError(null);
    };
    reader.onerror = () => {
      setPictureError("Could not read that image. Please try another file.");
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);

    if (!userId || !auth.currentUser) {
      setStatus({ type: "error", message: "Please log in first." });
      return;
    }

    const normalizedUsername = profile.username.trim();
    if (!normalizedUsername) {
      setStatus({ type: "error", message: "Username is required." });
      return;
    }

    const normalizedProfile: UserProfile = {
      username: normalizedUsername,
      gender: profile.gender.trim(),
      bio: profile.bio.trim(),
      workoutSplit: profile.workoutSplit.trim(),
      photoDataUrl: profile.photoDataUrl.trim(),
    };

    setIsSaving(true);

    try {
      await updateProfile(auth.currentUser, {
        displayName: normalizedProfile.username,
      });

      await saveUserProfile(userId, normalizedProfile);
      await savePublicUserProfile(userId, normalizedProfile);
      setProfile(normalizedProfile);
      broadcastProfileUpdated(normalizedProfile);
      setStatus({ type: "success", message: "Profile updated." });
    } catch {
      setStatus({
        type: "error",
        message: "Unable to save your profile right now. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAuthResolved || isLoading) {
    return (
      <section className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Loading profile...
        </div>
      </section>
    );
  }

  if (!userId) {
    return (
      <section className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Profile</h1>
          <p className="mt-2 text-sm text-slate-600">Sign in to edit your profile details.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Account</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Profile</h1>
        <p className="mt-2 text-sm text-slate-600">
          Edit your picture, username, gender, bio, and current workout split.
        </p>
        <Link
          href={`/users/${userId}`}
          className="mt-3 inline-flex rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          View public profile
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-slate-300 bg-slate-100">
            {profilePreviewPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profilePreviewPhoto} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <span className="text-3xl font-semibold text-slate-500">
                {profilePreviewName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <p className="mt-4 text-center text-base font-semibold text-slate-900">{profilePreviewName}</p>
          <p className="mt-1 text-center text-xs text-slate-500">
            {profile.workoutSplit.trim() || "No workout split selected"}
          </p>
        </aside>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="profile-photo-upload" className="mb-1 block text-sm font-semibold text-slate-700">
                Attach picture
              </label>
              <input
                id="profile-photo-upload"
                name="photoUpload"
                type="file"
                accept="image/*"
                onChange={handlePictureChange}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
              />
              <p className="mt-1 text-xs text-slate-500">PNG/JPG/WebP up to 2MB.</p>
              {profile.photoDataUrl ? (
                <button
                  type="button"
                  onClick={() => {
                    const nextProfile = { ...profile, photoDataUrl: "" };
                    setProfile(nextProfile);
                    broadcastProfileUpdated(nextProfile);
                  }}
                  className="mt-2 text-xs font-semibold text-slate-600 underline-offset-4 hover:underline"
                >
                  Remove picture
                </button>
              ) : null}
              {pictureError ? (
                <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {pictureError}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="profile-username" className="mb-1 block text-sm font-semibold text-slate-700">
                Username
              </label>
              <input
                id="profile-username"
                name="username"
                type="text"
                required
                value={profile.username}
                onChange={(event) => updateField("username", event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
                placeholder="janeathlete"
              />
            </div>

            <div>
              <label htmlFor="profile-gender" className="mb-1 block text-sm font-semibold text-slate-700">
                Gender
              </label>
              <select
                id="profile-gender"
                name="gender"
                value={profile.gender}
                onChange={(event) => updateField("gender", event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
              >
                <option value="">Prefer not to say</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Non-binary">Non-binary</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="profile-bio" className="mb-1 block text-sm font-semibold text-slate-700">
                Bio
              </label>
              <textarea
                id="profile-bio"
                name="bio"
                rows={4}
                value={profile.bio}
                onChange={(event) => updateField("bio", event.target.value)}
                placeholder="Tell us about your training goals..."
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="profile-workout-split" className="mb-1 block text-sm font-semibold text-slate-700">
                Current workout split
              </label>
              <input
                id="profile-workout-split"
                name="workoutSplit"
                type="text"
                value={profile.workoutSplit}
                onChange={(event) => updateField("workoutSplit", event.target.value)}
                placeholder="Push/Pull/Legs"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-300"
              />
            </div>

            <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Current Split In Use
              </p>
              {isSplitLoading ? (
                <p className="mt-2 text-sm text-slate-600">Loading current split...</p>
              ) : displayedSplitName ? (
                <>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{displayedSplitName}</p>
                  {currentSplitExercises.length > 0 ? (
                    <ul className="mt-2 grid gap-1 text-sm text-slate-700">
                      {currentSplitExercises.map((exercise) => (
                        <li key={exercise}>- {exercise}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-600">
                      Add exercises in Planner to show 4-5 current exercises here.
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-600">
                  No active split found yet. Build one in Planner to show it here.
                </p>
              )}
            </div>
          </div>

          {status ? (
            <p
              className={`mt-4 rounded-md px-3 py-2 text-sm ${
                status.type === "error"
                  ? "border border-rose-200 bg-rose-50 text-rose-700"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {status.message}
            </p>
          ) : null}

          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSaving ? "Saving..." : "Save profile"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
