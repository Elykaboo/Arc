"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  followUser,
  isFollowingUser,
  listFollowingUsers,
  listUsersFromFollowGraph,
  unfollowUser,
  type FollowGraphUser,
} from "@/lib/follow-db";
import {
  listMemberProfiles,
  type MemberProfile,
} from "@/lib/member-db";
import {
  listPublicUserProfiles,
  type PublicUserProfile,
} from "@/lib/public-profile-db";
import {
  listSearchableUserProfiles,
  type SearchableUserProfile,
  type UserProfile,
} from "@/lib/profile-db";
import {
  listCommunityPosts,
  type CommunityPost,
} from "@/lib/community-db";
import type { CommunityDirectoryInitialData } from "@/lib/server-community-directory";

type DirectoryUser = {
  uid: string;
  username: string;
  bio: string;
  workoutSplit: string;
  photoDataUrl: string;
};

const upsertPublicProfile = (
  profiles: PublicUserProfile[],
  profile: PublicUserProfile,
): PublicUserProfile[] => {
  const nextProfiles = profiles.filter((entry) => entry.uid !== profile.uid);
  nextProfiles.push(profile);
  return nextProfiles;
};

const upsertSearchableProfile = (
  profiles: SearchableUserProfile[],
  profile: SearchableUserProfile,
): SearchableUserProfile[] => {
  const nextProfiles = profiles.filter((entry) => entry.uid !== profile.uid);
  nextProfiles.push(profile);
  return nextProfiles;
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AR";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const buildDirectoryUsers = (
  memberProfiles: MemberProfile[],
  publicProfiles: PublicUserProfile[],
  searchableProfiles: SearchableUserProfile[],
  communityPosts: CommunityPost[],
  followGraphUsers: FollowGraphUser[],
): DirectoryUser[] => {
  const usersById = new Map<string, DirectoryUser>();

  for (const member of memberProfiles) {
    const username = member.username.trim();
    if (!member.uid || !username) continue;

    usersById.set(member.uid, {
      uid: member.uid,
      username,
      bio: member.bio.trim(),
      workoutSplit: member.workoutSplit.trim(),
      photoDataUrl: member.photoDataUrl.trim(),
    });
  }

  for (const profile of publicProfiles) {
    const username = profile.username.trim();
    if (!profile.uid || !username) continue;

    usersById.set(profile.uid, {
      uid: profile.uid,
      username,
      bio: profile.bio.trim(),
      workoutSplit: profile.workoutSplit.trim(),
      photoDataUrl: profile.photoDataUrl.trim(),
    });
  }

  for (const profile of searchableProfiles) {
    const username = profile.username.trim();
    if (!profile.uid || !username) continue;

    const existing = usersById.get(profile.uid);
    usersById.set(profile.uid, {
      uid: profile.uid,
      username: existing?.username || username,
      bio: existing?.bio || profile.bio.trim(),
      workoutSplit: existing?.workoutSplit || profile.workoutSplit.trim(),
      photoDataUrl: existing?.photoDataUrl || profile.photoDataUrl.trim(),
    });
  }

  for (const post of communityPosts) {
    const username = post.authorName.trim();
    if (!post.uid || !username) continue;

    const existing = usersById.get(post.uid);
    usersById.set(post.uid, {
      uid: post.uid,
      username: existing?.username || username,
      bio: existing?.bio || "",
      workoutSplit: existing?.workoutSplit || "",
      photoDataUrl: existing?.photoDataUrl || post.authorPhotoDataUrl.trim(),
    });
  }

  for (const user of followGraphUsers) {
    if (!user.uid) continue;

    const existing = usersById.get(user.uid);
    usersById.set(user.uid, {
      uid: user.uid,
      username: existing?.username || user.username || "Arc Member",
      bio: existing?.bio || "",
      workoutSplit: existing?.workoutSplit || "",
      photoDataUrl: existing?.photoDataUrl || user.photoDataUrl.trim(),
    });
  }

  return Array.from(usersById.values()).sort((left, right) =>
    left.username.localeCompare(right.username, undefined, { sensitivity: "base" }),
  );
};

type CommunityDirectoryClientProps = {
  initialData?: CommunityDirectoryInitialData | null;
};

export default function CommunityDirectoryClient({ initialData = null }: CommunityDirectoryClientProps) {
  const [viewerUid, setViewerUid] = useState<string | null>(null);
  const [viewerName, setViewerName] = useState("Arc User");
  const [viewerPhoto, setViewerPhoto] = useState("");
  const [memberProfiles, setMemberProfiles] = useState<MemberProfile[]>(initialData?.memberProfiles || []);
  const [publicProfiles, setPublicProfiles] = useState<PublicUserProfile[]>(initialData?.publicProfiles || []);
  const [searchableProfiles, setSearchableProfiles] = useState<SearchableUserProfile[]>(initialData?.searchableProfiles || []);
  const [communityPosts, setCommunityPosts] = useState<CommunityPost[]>(initialData?.communityPosts || []);
  const [followGraphUsers, setFollowGraphUsers] = useState<FollowGraphUser[]>(initialData?.followGraphUsers || []);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingMemberProfiles, setIsLoadingMemberProfiles] = useState(!initialData);
  const [isLoadingPublicProfiles, setIsLoadingPublicProfiles] = useState(!initialData);
  const [isLoadingSearchableProfiles, setIsLoadingSearchableProfiles] = useState(!initialData);
  const [isLoadingCommunityPosts, setIsLoadingCommunityPosts] = useState(!initialData);
  const [isLoadingFollowGraphUsers, setIsLoadingFollowGraphUsers] = useState(!initialData);
  const [status, setStatus] = useState<string | null>(null);
  const [followingByUid, setFollowingByUid] = useState<Record<string, boolean>>({});
  const [followBusyByUid, setFollowBusyByUid] = useState<Record<string, boolean>>({});
  const hasHydratedInitialDirectoryRef = useRef(Boolean(initialData));

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setViewerUid(user?.uid ?? null);
      const fallbackName = user?.displayName?.trim() || user?.email?.split("@")[0] || "Arc User";
      const fallbackPhoto = user?.photoURL?.trim() || "";

      setViewerName(fallbackName);
      setViewerPhoto(fallbackPhoto);

      if (!user?.uid) return;

      setMemberProfiles((current) => {
        const existing = current.find((entry) => entry.uid === user.uid);
        const next = current.filter((entry) => entry.uid !== user.uid);
        next.push({
          uid: user.uid,
          username: existing?.username || fallbackName,
          bio: existing?.bio || "",
          workoutSplit: existing?.workoutSplit || "",
          photoDataUrl: existing?.photoDataUrl || fallbackPhoto,
        });
        return next;
      });
      setPublicProfiles((current) =>
        upsertPublicProfile(current, {
          uid: user.uid,
          username: current.find((entry) => entry.uid === user.uid)?.username || fallbackName,
          bio: current.find((entry) => entry.uid === user.uid)?.bio || "",
          workoutSplit: current.find((entry) => entry.uid === user.uid)?.workoutSplit || "",
          photoDataUrl: current.find((entry) => entry.uid === user.uid)?.photoDataUrl || fallbackPhoto,
        }),
      );
      setSearchableProfiles((current) =>
        upsertSearchableProfile(current, {
          uid: user.uid,
          username: current.find((entry) => entry.uid === user.uid)?.username || fallbackName,
          bio: current.find((entry) => entry.uid === user.uid)?.bio || "",
          workoutSplit: current.find((entry) => entry.uid === user.uid)?.workoutSplit || "",
          photoDataUrl: current.find((entry) => entry.uid === user.uid)?.photoDataUrl || fallbackPhoto,
        }),
      );

      setFollowGraphUsers((current) => {
        const existing = current.find((entry) => entry.uid === user.uid);
        const next = current.filter((entry) => entry.uid !== user.uid);
        next.push({
          uid: user.uid,
          username: existing?.username || fallbackName,
          photoDataUrl: existing?.photoDataUrl || fallbackPhoto,
        });
        return next;
      });
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (hasHydratedInitialDirectoryRef.current) {
      hasHydratedInitialDirectoryRef.current = false;

      const allSourcesEmpty =
        (initialData?.memberProfiles.length || 0) === 0 &&
        (initialData?.publicProfiles.length || 0) === 0 &&
        (initialData?.searchableProfiles.length || 0) === 0 &&
        (initialData?.communityPosts.length || 0) === 0 &&
        (initialData?.followGraphUsers.length || 0) === 0;

      if (allSourcesEmpty) {
        setStatus("No members are visible yet.");
      }

      return;
    }

    setStatus(null);
    setIsLoadingMemberProfiles(true);
    setIsLoadingPublicProfiles(true);
    setIsLoadingSearchableProfiles(true);
    setIsLoadingCommunityPosts(true);
    setIsLoadingFollowGraphUsers(true);

    let cancelled = false;

    const loadDirectoryData = async () => {
      const [
        memberProfilesResult,
        publicProfilesResult,
        searchableProfilesResult,
        communityPostsResult,
        followGraphUsersResult,
      ] = await Promise.allSettled([
        listMemberProfiles(4000),
        listPublicUserProfiles(2000),
        listSearchableUserProfiles(2000),
        listCommunityPosts(200),
        listUsersFromFollowGraph(4000),
      ]);

      if (cancelled) return;

      if (memberProfilesResult.status === "fulfilled") {
        setMemberProfiles(memberProfilesResult.value);
      }
      setIsLoadingMemberProfiles(false);

      if (publicProfilesResult.status === "fulfilled") {
        setPublicProfiles(publicProfilesResult.value);
      }
      setIsLoadingPublicProfiles(false);

      if (searchableProfilesResult.status === "fulfilled") {
        setSearchableProfiles(searchableProfilesResult.value);
      }
      setIsLoadingSearchableProfiles(false);

      if (communityPostsResult.status === "fulfilled") {
        setCommunityPosts(communityPostsResult.value);
      }
      setIsLoadingCommunityPosts(false);

      if (followGraphUsersResult.status === "fulfilled") {
        setFollowGraphUsers(followGraphUsersResult.value);
      }
      setIsLoadingFollowGraphUsers(false);

      const allSourcesFailed =
        memberProfilesResult.status === "rejected" &&
        publicProfilesResult.status === "rejected" &&
        searchableProfilesResult.status === "rejected" &&
        communityPostsResult.status === "rejected" &&
        followGraphUsersResult.status === "rejected";

      if (allSourcesFailed) {
        setStatus("Unable to load the community right now.");
      }
    };

    void loadDirectoryData();

    const onProfileUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<UserProfile>;
      const nextProfile = customEvent.detail;
      if (!viewerUid || !nextProfile) return;
      const fallbackViewerName =
        nextProfile.username.trim() ||
        auth.currentUser?.displayName?.trim() ||
        auth.currentUser?.email?.split("@")[0] ||
        "Arc User";

      setViewerName(fallbackViewerName);
      setViewerPhoto(nextProfile.photoDataUrl.trim());
      setMemberProfiles((current) => {
        const next = current.filter((entry) => entry.uid !== viewerUid);
        next.push({
          uid: viewerUid,
          username: fallbackViewerName,
          bio: nextProfile.bio.trim(),
          workoutSplit: nextProfile.workoutSplit.trim(),
          photoDataUrl: nextProfile.photoDataUrl.trim(),
        });
        return next;
      });
      setPublicProfiles((current) =>
        upsertPublicProfile(current, {
          uid: viewerUid,
          username: fallbackViewerName,
          bio: nextProfile.bio.trim(),
          workoutSplit: nextProfile.workoutSplit.trim(),
          photoDataUrl: nextProfile.photoDataUrl.trim(),
        }),
      );
      setSearchableProfiles((current) =>
        upsertSearchableProfile(current, {
          uid: viewerUid,
          username: fallbackViewerName,
          bio: nextProfile.bio.trim(),
          workoutSplit: nextProfile.workoutSplit.trim(),
          photoDataUrl: nextProfile.photoDataUrl.trim(),
        }),
      );
      setFollowGraphUsers((current) => {
        const next = current.filter((entry) => entry.uid !== viewerUid);
        next.push({
          uid: viewerUid,
          username: fallbackViewerName,
          photoDataUrl: nextProfile.photoDataUrl.trim(),
        });
        return next;
      });
    };

    window.addEventListener("profile-updated", onProfileUpdated as EventListener);
    window.addEventListener("focus", loadDirectoryData);

    return () => {
      cancelled = true;
      window.removeEventListener("profile-updated", onProfileUpdated as EventListener);
      window.removeEventListener("focus", loadDirectoryData);
    };
  }, [initialData, viewerUid]);

  const users = useMemo(
    () =>
      buildDirectoryUsers(
        memberProfiles,
        publicProfiles,
        searchableProfiles,
        communityPosts,
        followGraphUsers,
      ),
    [communityPosts, followGraphUsers, memberProfiles, publicProfiles, searchableProfiles],
  );

  const isLoading =
    isLoadingMemberProfiles ||
    isLoadingPublicProfiles ||
    isLoadingSearchableProfiles ||
    isLoadingCommunityPosts ||
    isLoadingFollowGraphUsers;

  useEffect(() => {
    if (isLoading) return;

    if (users.length === 0) {
      setStatus("No members are visible yet.");
      return;
    }

    setStatus(null);
  }, [isLoading, users.length]);

  useEffect(() => {
    if (!viewerUid) {
      setFollowingByUid({});
      setFollowBusyByUid({});
      return;
    }

    let cancelled = false;

    const loadFollowing = async () => {
      try {
        const followingUsers = await listFollowingUsers(viewerUid, 1000);
        if (cancelled) return;

        setFollowingByUid(
          followingUsers.reduce<Record<string, boolean>>((accumulator, user) => {
            accumulator[user.uid] = true;
            return accumulator;
          }, {}),
        );
      } catch {
        if (!cancelled) {
          setFollowingByUid({});
        }
      }
    };

    void loadFollowing();

    return () => {
      cancelled = true;
    };
  }, [viewerUid]);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const visibleUsers = useMemo(() => {
    const filteredUsers = normalizedSearch
      ? users.filter((user) => {
          const name = user.username.toLowerCase();
          const bio = user.bio.toLowerCase();
          const split = user.workoutSplit.toLowerCase();
          return (
            name.includes(normalizedSearch) ||
            bio.includes(normalizedSearch) ||
            split.includes(normalizedSearch)
          );
        })
      : users;

    if (!viewerUid) return filteredUsers;

    const currentUser = filteredUsers.find((user) => user.uid === viewerUid);
    if (!currentUser) return filteredUsers;

    return [currentUser, ...filteredUsers.filter((user) => user.uid !== viewerUid)];
  }, [normalizedSearch, users, viewerUid]);

  const toggleFollow = async (user: DirectoryUser) => {
    if (!viewerUid) {
      setStatus("Log in to follow community members.");
      return;
    }
    if (viewerUid === user.uid || followBusyByUid[user.uid]) return;

    setFollowBusyByUid((current) => ({ ...current, [user.uid]: true }));
    setStatus(null);

    try {
      const currentlyFollowing = await isFollowingUser(viewerUid, user.uid);
      if (currentlyFollowing) {
        await unfollowUser(viewerUid, user.uid);
      } else {
        await followUser(
          viewerUid,
          {
            uid: user.uid,
            username: user.username,
            photoDataUrl: user.photoDataUrl,
          },
          {
            username: viewerName,
            photoDataUrl: viewerPhoto,
          },
        );
      }

      const nextFollowing = await isFollowingUser(viewerUid, user.uid);
      setFollowingByUid((current) => ({
        ...current,
        [user.uid]: nextFollowing,
      }));
      setStatus(nextFollowing ? `Now following ${user.username}.` : `Unfollowed ${user.username}.`);
    } catch {
      setStatus("Unable to update follow right now.");
    } finally {
      setFollowBusyByUid((current) => ({ ...current, [user.uid]: false }));
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 bg-[radial-gradient(circle_at_15%_0%,rgba(15,23,42,0.22),transparent_42%),radial-gradient(circle_at_86%_8%,rgba(8,47,73,0.16),transparent_36%)] px-3 py-4 sm:px-4 sm:py-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white/95 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/95">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
              Member Directory
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              Community
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Browse every visible Arc member, open profiles, and follow people you want to keep up with.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:w-auto">
            <div className="rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-800/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                Members
              </p>
              <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{users.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-800/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                Showing
              </p>
              <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{visibleUsers.length}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by username, bio, or workout split..."
            className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none ring-slate-300 transition focus:ring dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Clear
            </button>
          ) : null}
        </div>

        {status ? <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{status}</p> : null}
      </section>

      <section>
        {isLoading ? (
          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            Loading community members...
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            No member records were found in Firestore yet.
          </div>
        ) : visibleUsers.length === 0 ? (
          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            No members matched your search.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleUsers.map((user) => {
              const initials = getInitials(user.username);
              const isSelf = viewerUid === user.uid;
              const isFollowing = Boolean(followingByUid[user.uid]);
              const isBusy = Boolean(followBusyByUid[user.uid]);

              return (
                <article
                  key={user.uid}
                  className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="flex items-start gap-4">
                    <Link href={`/users/${user.uid}`} className="shrink-0">
                      {user.photoDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.photoDataUrl}
                          alt={`${user.username} profile`}
                          className="h-16 w-16 rounded-2xl border border-slate-200 object-cover dark:border-slate-700"
                        />
                      ) : (
                        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold text-white dark:bg-slate-100 dark:text-slate-900">
                          {initials}
                        </span>
                      )}
                    </Link>

                    <div className="min-w-0 flex-1">
                      <Link href={`/users/${user.uid}`} className="block">
                        <h2 className="truncate text-lg font-bold text-slate-900 dark:text-white">
                          {user.username}
                        </h2>
                      </Link>
                      <p className="mt-1 line-clamp-3 min-h-[3.75rem] text-sm text-slate-600 dark:text-slate-300">
                        {user.bio || "This member has not added a bio yet."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-slate-100 px-3 py-2 dark:bg-slate-800/70">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                        Workout Split
                      </p>
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                        {user.workoutSplit || "Not set"}
                      </p>
                    </div>
                    <Link
                      href={`/users/${user.uid}`}
                      className="shrink-0 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-white dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-900"
                    >
                      View profile
                    </Link>
                  </div>

                  {!isSelf ? (
                    <button
                      type="button"
                      onClick={() => {
                        void toggleFollow(user);
                      }}
                      disabled={isBusy}
                      className={`mt-4 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                        isFollowing
                          ? "border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
                          : "bg-slate-900 text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {isBusy ? "Updating..." : isFollowing ? "Following" : "Follow"}
                    </button>
                  ) : (
                    <p className="mt-4 rounded-2xl bg-cyan-50 px-4 py-3 text-center text-sm font-semibold text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200">
                      Your profile
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
