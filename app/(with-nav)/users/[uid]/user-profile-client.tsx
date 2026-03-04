"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  countFollowersForUser,
  followUser,
  isFollowingUser,
  listFollowingUsers,
  unfollowUser,
} from "@/lib/follow-db";
import { loadMemberProfile } from "@/lib/member-db";
import {
  getCommunityPostPhotoDataUrls,
  listCommunityPostsByUser,
  type CommunityPost,
} from "@/lib/community-db";
import { loadPublicUserProfile } from "@/lib/public-profile-db";
import { loadUserProfile } from "@/lib/profile-db";

type UserProfileClientProps = {
  uid: string;
};

type ViewProfile = {
  uid: string;
  username: string;
  bio: string;
  workoutSplit: string;
  photoDataUrl: string;
};

const formatTimestamp = (value: CommunityPost["createdAt"]): string => {
  if (!value) return "Recently";

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(value.toDate());
  } catch {
    return "Recently";
  }
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AR";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

export default function UserProfileClient({ uid }: UserProfileClientProps) {
  const [viewerUid, setViewerUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<ViewProfile | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowStateLoading, setIsFollowStateLoading] = useState(false);
  const [isFollowBusy, setIsFollowBusy] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setViewerUid(user?.uid ?? null);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setStatus(null);

      try {
        const [memberProfileResult, publicProfileResult, privateProfileResult, recentPostsResult] = await Promise.allSettled([
          loadMemberProfile(uid),
          loadPublicUserProfile(uid),
          loadUserProfile(uid),
          listCommunityPostsByUser(uid, 12),
        ]);
        if (cancelled) return;

        const memberProfile =
          memberProfileResult.status === "fulfilled" ? memberProfileResult.value : null;
        const publicProfile =
          publicProfileResult.status === "fulfilled" ? publicProfileResult.value : null;
        const privateProfile =
          privateProfileResult.status === "fulfilled" ? privateProfileResult.value : null;
        const recentPosts = recentPostsResult.status === "fulfilled" ? recentPostsResult.value : [];

        if (
          memberProfileResult.status === "rejected" &&
          publicProfileResult.status === "rejected" &&
          privateProfileResult.status === "rejected" &&
          recentPostsResult.status === "rejected"
        ) {
          setStatus("Unable to load this profile right now.");
        } else if (
          memberProfileResult.status === "rejected" &&
          publicProfileResult.status === "rejected" &&
          privateProfileResult.status === "rejected"
        ) {
          setStatus("Profile details are limited right now.");
        }

        const fallbackName =
          recentPosts[0]?.authorName?.trim() ||
          memberProfile?.username?.trim() ||
          privateProfile?.username?.trim() ||
          auth.currentUser?.displayName?.trim() ||
          "Arc User";
        const fallbackPhoto =
          recentPosts[0]?.authorPhotoDataUrl?.trim() ||
          memberProfile?.photoDataUrl?.trim() ||
          privateProfile?.photoDataUrl?.trim() ||
          auth.currentUser?.photoURL?.trim() ||
          "";

        if (!memberProfile && !publicProfile && !privateProfile && recentPosts.length === 0) {
          setProfile(null);
          setPosts([]);
          return;
        }

        setProfile({
          uid,
          username:
            memberProfile?.username?.trim() ||
            publicProfile?.username?.trim() ||
            privateProfile?.username?.trim() ||
            fallbackName,
          bio:
            memberProfile?.bio?.trim() ||
            publicProfile?.bio?.trim() ||
            privateProfile?.bio?.trim() ||
            "",
          workoutSplit:
            memberProfile?.workoutSplit?.trim() ||
            publicProfile?.workoutSplit?.trim() ||
            privateProfile?.workoutSplit?.trim() ||
            "",
          photoDataUrl:
            memberProfile?.photoDataUrl?.trim() ||
            publicProfile?.photoDataUrl?.trim() ||
            privateProfile?.photoDataUrl?.trim() ||
            fallbackPhoto,
        });
        setPosts(recentPosts);
      } catch {
        if (!cancelled) {
          setProfile(null);
          setPosts([]);
          setStatus("Unable to load this profile right now.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [uid, viewerUid]);

  useEffect(() => {
    let cancelled = false;

    const loadFollowStats = async () => {
      try {
        const [followersTotal, followingUsers] = await Promise.all([
          countFollowersForUser(uid),
          listFollowingUsers(uid, 1000),
        ]);
        if (cancelled) return;
        setFollowersCount(followersTotal);
        setFollowingCount(followingUsers.length);
      } catch {
        if (cancelled) return;
        setFollowersCount(0);
        setFollowingCount(0);
      }
    };

    void loadFollowStats();

    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    if (!viewerUid || viewerUid === uid) {
      setIsFollowing(false);
      setIsFollowStateLoading(false);
      return;
    }

    let cancelled = false;

    const loadFollow = async () => {
      setIsFollowStateLoading(true);
      try {
        const followed = await isFollowingUser(viewerUid, uid);
        if (!cancelled) {
          setIsFollowing(followed);
        }
      } catch {
        if (!cancelled) {
          setIsFollowing(false);
        }
      } finally {
        if (!cancelled) {
          setIsFollowStateLoading(false);
        }
      }
    };

    void loadFollow();

    return () => {
      cancelled = true;
    };
  }, [uid, viewerUid]);

  const onToggleFollow = async () => {
    if (!viewerUid) {
      setStatus("Log in to follow users.");
      return;
    }
    if (!profile || viewerUid === uid || isFollowBusy || isFollowStateLoading) return;

    setIsFollowBusy(true);
    try {
      const wasFollowing = await isFollowingUser(viewerUid, uid);
      if (wasFollowing) {
        await unfollowUser(viewerUid, uid);
      } else {
        await followUser(
          viewerUid,
          {
            uid,
            username: profile.username,
            photoDataUrl: profile.photoDataUrl,
          },
          {
            username: auth.currentUser?.displayName || "",
            photoDataUrl: auth.currentUser?.photoURL || "",
          },
        );
      }

      const nextFollowing = await isFollowingUser(viewerUid, uid);
      setIsFollowing(nextFollowing);
      if (nextFollowing !== wasFollowing) {
        setFollowersCount((current) => Math.max(0, current + (nextFollowing ? 1 : -1)));
      }
      setStatus(nextFollowing ? "Now following user." : "Unfollowed user.");
    } catch {
      setStatus("Unable to update follow right now.");
    } finally {
      setIsFollowBusy(false);
    }
  };

  const initials = useMemo(() => {
    return getInitials(profile?.username || "Arc User");
  }, [profile?.username]);

  const weeklyActivityCount = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return posts.filter((post) => {
      try {
        return Boolean(post.createdAt && post.createdAt.toDate().getTime() >= cutoff);
      } catch {
        return false;
      }
    }).length;
  }, [posts]);

  const monthlyActivityCount = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return posts.filter((post) => {
      try {
        return Boolean(post.createdAt && post.createdAt.toDate().getTime() >= cutoff);
      } catch {
        return false;
      }
    }).length;
  }, [posts]);

  const lastActivityLabel = useMemo(() => {
    const mostRecent = posts.find((post) => post.createdAt);
    if (!mostRecent?.createdAt) return "No activity yet";
    return formatTimestamp(mostRecent.createdAt);
  }, [posts]);

  const displayedPosts = useMemo(() => posts.slice(0, 12), [posts]);

  if (isLoading) {
    return (
      <section className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          Loading profile...
        </div>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">User not found</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            This profile does not exist or has not posted anything yet.
          </p>
          <Link
            href="/socializing"
            className="mt-4 inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Back to Home
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-5 px-4 py-8">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            {profile.photoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.photoDataUrl}
                alt={`${profile.username} profile`}
                className="h-16 w-16 rounded-full border border-slate-200 object-cover dark:border-slate-700"
              />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white dark:bg-slate-100 dark:text-slate-900">
                {initials}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold text-slate-900 dark:text-slate-100">
                {profile.username}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                <span>{posts.length} recent posts</span>
                <span className="h-1 w-1 rounded-full bg-slate-400/80 dark:bg-slate-500" />
                <span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {followersCount}
                  </span>{" "}
                  Followers
                </span>
                <span className="h-1 w-1 rounded-full bg-slate-400/80 dark:bg-slate-500" />
                <span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {followingCount}
                  </span>{" "}
                  Following
                </span>
              </div>
            </div>
          </div>
          {viewerUid && viewerUid !== uid ? (
            <button
              type="button"
              onClick={() => {
                void onToggleFollow();
              }}
              disabled={isFollowBusy || isFollowStateLoading}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                isFollowing
                  ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  : "border-slate-900 bg-slate-900 text-white hover:bg-slate-800 dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {isFollowBusy || isFollowStateLoading ? "..." : isFollowing ? "Following" : "Follow"}
            </button>
          ) : null}
        </div>

        {profile.bio ? (
          <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{profile.bio}</p>
        ) : (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No bio added yet.</p>
        )}

        {status ? <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{status}</p> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            Current Split
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {profile.workoutSplit || "Not set"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            Gym Activity
          </p>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">This week: {weeklyActivityCount}</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">This month: {monthlyActivityCount}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Last active: {lastActivityLabel}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            Network
          </p>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Followers: {followersCount}</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Following: {followingCount}</p>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
          Recent Posts
        </h2>
        {displayedPosts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            No posts yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {displayedPosts.map((post) => {
              const postPhotos = getCommunityPostPhotoDataUrls(post);

              return (
                <li key={post.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{post.caption}</p>
                  {postPhotos.length > 0 ? (
                    <div
                      className={`mt-3 mx-auto grid max-w-sm gap-1 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 ${
                        postPhotos.length === 1 ? "grid-cols-1" : "grid-cols-2"
                      }`}
                    >
                      {postPhotos.map((photo, photoIndex) => (
                        <div
                          key={`${post.id}:photo:${photoIndex}`}
                          className={postPhotos.length === 3 && photoIndex === 0 ? "col-span-2" : ""}
                        >
                          <div className="aspect-[4/5] bg-slate-100 dark:bg-slate-800">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photo}
                              alt={`Progress update ${photoIndex + 1}`}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    {formatTimestamp(post.createdAt)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
