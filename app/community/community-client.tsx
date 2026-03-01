"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  countFollowersForUser,
  followUser,
  isFollowingUser,
  listFollowingUsers,
  unfollowUser,
  type FollowingUser,
} from "@/lib/follow-db";
import { listMemberProfiles, type MemberProfile } from "@/lib/member-db";
import { loadUserProfile } from "@/lib/profile-db";
import {
  createCommunityComment,
  createCommunityPost,
  deleteCommunityPost,
  listCommunityCommentsForPosts,
  listCommunityPosts,
  listCommunityPostsByUser,
  updateCommunityPostCaption,
  type CommunityComment,
  type CommunityPost,
} from "@/lib/community-db";

// Firestore document limit is 1 MiB; keep image payload well below that when base64-encoded.
const MAX_PHOTO_DATA_URL_BYTES = 280_000;

const formatTimestamp = (value: CommunityPost["createdAt"]): string => {
  if (!value) return "Just now";

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(value.toDate());
  } catch {
    return "Recently";
  }
};

const formatCommentTimestamp = (value: CommunityComment["createdAt"]): string => {
  if (!value) return "Just now";

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(value.toDate());
  } catch {
    return "Just now";
  }
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AR";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const dataUrlToBytes = (dataUrl: string): number => {
  const payload = dataUrl.split(",")[1] || "";
  return Math.ceil((payload.length * 3) / 4);
};

const dataUrlStringBytes = (dataUrl: string): number => {
  // Data URL is ASCII-safe, so string length is a reliable byte estimate.
  return dataUrl.length;
};

const resizeImageToDataUrl = async (file: File): Promise<string> => {
  const originalDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Unable to read image."));
      }
    };
    reader.onerror = () => reject(new Error("Unable to read image."));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Unable to load image."));
    img.src = originalDataUrl;
  });

  const maxDimension = 960;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const targetWidth = Math.max(1, Math.round(image.width * scale));
  const targetHeight = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to process image.");
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  let quality = 0.82;
  let result = canvas.toDataURL("image/jpeg", quality);

  while (dataUrlStringBytes(result) > MAX_PHOTO_DATA_URL_BYTES && quality > 0.2) {
    quality -= 0.07;
    result = canvas.toDataURL("image/jpeg", quality);
  }

  if (dataUrlStringBytes(result) > MAX_PHOTO_DATA_URL_BYTES || dataUrlToBytes(result) > 220_000) {
    throw new Error("Image is still too large after compression. Try a smaller photo.");
  }

  return result;
};

type CommunityClientProps = {
  heading?: string;
  description?: string;
};

type UserSuggestion = {
  uid: string;
  name: string;
  photo: string;
};

type SidebarProfileSummary = {
  username: string;
  bio: string;
  workoutSplit: string;
  photoDataUrl: string;
  postCount: number;
  mediaCount: number;
  followerCount: number;
};

export default function CommunityClient({
  heading = "Community",
  description = "Share progress photos, milestones, and small wins with everyone training on Arc.",
}: CommunityClientProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("Guest");
  const [profilePhoto, setProfilePhoto] = useState("");

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [caption, setCaption] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formStatus, setFormStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [likedPostIds, setLikedPostIds] = useState<Record<string, boolean>>({});
  const [commentsByPost, setCommentsByPost] = useState<Record<string, CommunityComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [activePostMenuId, setActivePostMenuId] = useState<string | null>(null);
  const [menuActionPostId, setMenuActionPostId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [memberProfiles, setMemberProfiles] = useState<MemberProfile[]>([]);
  const [followingUsers, setFollowingUsers] = useState<FollowingUser[]>([]);
  const [followingByUid, setFollowingByUid] = useState<Record<string, boolean>>({});
  const [followBusyByUid, setFollowBusyByUid] = useState<Record<string, boolean>>({});
  const [sidebarProfile, setSidebarProfile] = useState<SidebarProfileSummary | null>(null);
  const [isSidebarProfileLoading, setIsSidebarProfileLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUserId(user?.uid ?? null);

      const fallbackName = user?.displayName?.trim() || user?.email?.split("@")[0] || "Guest";
      setDisplayName(fallbackName);
      setProfilePhoto(user?.photoURL?.trim() || "");

      if (!user?.uid) return;

      try {
        const profile = await loadUserProfile(user.uid);
        if (profile?.username?.trim()) {
          setDisplayName(profile.username.trim());
        }
        if (profile?.photoDataUrl?.trim()) {
          setProfilePhoto(profile.photoDataUrl.trim());
        }
      } catch {
        // Keep auth fallback values when profile read fails.
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!userId) {
      setSidebarProfile(null);
      setIsSidebarProfileLoading(false);
      return;
    }

    let cancelled = false;

    const loadSidebarProfile = async () => {
      setIsSidebarProfileLoading(true);

      try {
        const [profileResult, postsResult, followersResult] = await Promise.allSettled([
          loadUserProfile(userId),
          listCommunityPostsByUser(userId, 100),
          countFollowersForUser(userId),
        ]);
        if (cancelled) return;

        const profile = profileResult.status === "fulfilled" ? profileResult.value : null;
        const userPosts = postsResult.status === "fulfilled" ? postsResult.value : [];
        const followerCount = followersResult.status === "fulfilled" ? followersResult.value : 0;

        setSidebarProfile({
          username:
            profile?.username?.trim() ||
            auth.currentUser?.displayName?.trim() ||
            auth.currentUser?.email?.split("@")[0] ||
            "Arc User",
          bio: profile?.bio?.trim() || "",
          workoutSplit: profile?.workoutSplit?.trim() || "",
          photoDataUrl: profile?.photoDataUrl?.trim() || auth.currentUser?.photoURL?.trim() || "",
          postCount: userPosts.length,
          mediaCount: userPosts.filter((post) => Boolean(post.progressPhotoDataUrl?.trim())).length,
          followerCount,
        });
      } catch {
        if (cancelled) return;

        setSidebarProfile({
          username:
            auth.currentUser?.displayName?.trim() ||
            auth.currentUser?.email?.split("@")[0] ||
            "Arc User",
          bio: "",
          workoutSplit: "",
          photoDataUrl: auth.currentUser?.photoURL?.trim() || "",
          postCount: 0,
          mediaCount: 0,
          followerCount: 0,
        });
      } finally {
        if (!cancelled) {
          setIsSidebarProfileLoading(false);
        }
      }
    };

    void loadSidebarProfile();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const loadPosts = async (silent = false) => {
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoadingPosts(true);
    }

    try {
      const data = await listCommunityPosts(40);
      setPosts(data);
    } finally {
      setIsLoadingPosts(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadPosts();
  }, []);

  useEffect(() => {
    const visiblePostIds = posts.map((post) => post.id);
    if (visiblePostIds.length === 0) {
      setCommentsByPost({});
      return;
    }

    let cancelled = false;

    const loadComments = async () => {
      try {
        const comments = await listCommunityCommentsForPosts(visiblePostIds);
        if (!cancelled) {
          setCommentsByPost(comments);
        }
      } catch {
        if (!cancelled) {
          setCommentsByPost({});
        }
      }
    };

    void loadComments();

    return () => {
      cancelled = true;
    };
  }, [posts]);

  useEffect(() => {
    let cancelled = false;

    const loadMemberIndex = async () => {
      try {
        const profiles = await listMemberProfiles(4000);
        if (!cancelled) {
          setMemberProfiles(profiles);
        }
      } catch {
        if (!cancelled) {
          setMemberProfiles([]);
        }
      }
    };

    void loadMemberIndex();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setFollowingUsers([]);
      setFollowingByUid({});
      setFollowBusyByUid({});
      return;
    }

    let cancelled = false;

    const loadFollowing = async () => {
      try {
        const followingUsers = await listFollowingUsers(userId);
        if (cancelled) return;

        setFollowingUsers(followingUsers);
        const nextState = followingUsers.reduce<Record<string, boolean>>((accumulator, user) => {
          accumulator[user.uid] = true;
          return accumulator;
        }, {});
        setFollowingByUid(nextState);
      } catch {
        if (!cancelled) {
          setFollowingUsers([]);
          setFollowingByUid({});
        }
      }
    };

    void loadFollowing();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const onPhotoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setPhotoDataUrl("");
      setPhotoPreview("");
      setPhotoError(null);
      return;
    }

    setPhotoError(null);

    try {
      const processed = await resizeImageToDataUrl(file);
      setPhotoDataUrl(processed);
      setPhotoPreview(processed);
    } catch (error: unknown) {
      setPhotoDataUrl("");
      setPhotoPreview("");
      setPhotoError(error instanceof Error ? error.message : "Unable to process selected image.");
    }
  };

  const canSubmit = useMemo(() => {
    return Boolean(userId && caption.trim().length > 0 && !isSubmitting);
  }, [caption, isSubmitting, userId]);

  const storyProfiles = useMemo(() => {
    const currentUserProfile = {
      uid: userId ?? "",
      name: displayName,
      photo: profilePhoto,
    };
    const followedProfiles = followingUsers
      .filter((followedUser) => followedUser.uid !== userId)
      .map((followedUser) => ({
        uid: followedUser.uid,
        name: followedUser.username || "Arc User",
        photo: followedUser.photoDataUrl || "",
      }));
    return [currentUserProfile, ...followedProfiles].slice(0, 9);
  }, [displayName, followingUsers, profilePhoto, userId]);

  const last7DaysPosts = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return posts.filter((post) => {
      try {
        return Boolean(post.createdAt && post.createdAt.toDate().getTime() >= cutoff);
      } catch {
        return false;
      }
    }).length;
  }, [posts]);

  const photoPostRatio = useMemo(() => {
    if (posts.length === 0) return 0;
    const withPhoto = posts.filter((post) => Boolean(post.progressPhotoDataUrl)).length;
    return Math.round((withPhoto / posts.length) * 100);
  }, [posts]);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const searchableUsers = useMemo(() => {
    const unique = new Map<string, UserSuggestion>();

    for (const profile of memberProfiles) {
      const name = profile.username.trim();
      if (!name) continue;
      const key = profile.uid.toLowerCase();
      if (unique.has(key)) continue;
      unique.set(key, {
        uid: profile.uid,
        name,
        photo: profile.photoDataUrl || "",
      });
    }

    for (const followedUser of followingUsers) {
      const name = followedUser.username.trim();
      if (!name) continue;
      const key = followedUser.uid.toLowerCase();
      if (unique.has(key)) continue;
      unique.set(key, {
        uid: followedUser.uid,
        name,
        photo: followedUser.photoDataUrl || "",
      });
    }

    for (const post of posts) {
      const name = (post.authorName || "").trim();
      if (!name || !post.uid) continue;
      const key = post.uid.toLowerCase();
      if (unique.has(key)) continue;
      unique.set(key, { uid: post.uid, name, photo: post.authorPhotoDataUrl || "" });
    }

    return Array.from(unique.values());
  }, [followingUsers, memberProfiles, posts]);

  const usernameSuggestions = useMemo(() => {
    if (!normalizedSearch) return [];
    const startsWithMatches: UserSuggestion[] = [];
    const includesMatches: UserSuggestion[] = [];

    for (const user of searchableUsers) {
      const normalizedName = user.name.toLowerCase();
      if (normalizedName.startsWith(normalizedSearch)) {
        startsWithMatches.push(user);
      } else if (normalizedName.includes(normalizedSearch)) {
        includesMatches.push(user);
      }
    }

    return [...startsWithMatches, ...includesMatches].slice(0, 8);
  }, [normalizedSearch, searchableUsers]);

  const filteredPosts = useMemo(() => {
    if (!normalizedSearch) return posts;

    return posts.filter((post) => {
      const author = (post.authorName || "").toLowerCase();
      const captionText = (post.caption || "").toLowerCase();
      const postId = post.id.toLowerCase();
      return (
        author.includes(normalizedSearch) ||
        captionText.includes(normalizedSearch) ||
        postId.includes(normalizedSearch)
      );
    });
  }, [normalizedSearch, posts]);

  const matchedUsers = useMemo(
    () => usernameSuggestions.map((suggestion) => suggestion.name),
    [usernameSuggestions],
  );
  const totalSearchMatches = filteredPosts.length + usernameSuggestions.length;

  const viewerStorageKey = userId ?? "guest";

  useEffect(() => {
    try {
      const likesRaw = window.localStorage.getItem(`community:likes:${viewerStorageKey}`);
      setLikedPostIds(likesRaw ? (JSON.parse(likesRaw) as Record<string, boolean>) : {});
    } catch {
      setLikedPostIds({});
    }

  }, [viewerStorageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(`community:likes:${viewerStorageKey}`, JSON.stringify(likedPostIds));
    } catch {
      // Ignore persistence failures.
    }
  }, [likedPostIds, viewerStorageKey]);

  useEffect(() => {
    if (!activePostMenuId) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest("[data-post-menu-root]")) {
        setActivePostMenuId(null);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActivePostMenuId(null);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activePostMenuId]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!userId) {
      setFormStatus({ type: "error", message: "Log in to share a community post." });
      return;
    }

    if (!caption.trim()) {
      setFormStatus({ type: "error", message: "Add a short caption before posting." });
      return;
    }

    setIsSubmitting(true);
    setFormStatus(null);

    try {
      await createCommunityPost({
        uid: userId,
        authorName: displayName,
        authorPhotoDataUrl: profilePhoto,
        caption: caption.trim(),
        progressPhotoDataUrl: photoDataUrl,
      });

      setCaption("");
      setPhotoDataUrl("");
      setPhotoPreview("");
      setPhotoError(null);
      setSidebarProfile((current) =>
        current
          ? {
              ...current,
              postCount: current.postCount + 1,
              mediaCount: current.mediaCount + (photoDataUrl ? 1 : 0),
            }
          : current,
      );
      setFormStatus({ type: "success", message: "Post shared with the community." });
      await loadPosts(true);
    } catch (error: unknown) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Unable to share post right now. Try again.";
      setFormStatus({ type: "error", message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleLike = (postId: string) => {
    if (!userId) {
      setActionStatus("Log in to like posts.");
      return;
    }

    setLikedPostIds((current) => ({
      ...current,
      [postId]: !current[postId],
    }));
    setActionStatus(null);
  };

  const toggleFollow = async (post: CommunityPost) => {
    if (!userId) {
      setActionStatus("Log in to follow users.");
      return;
    }

    if (post.uid === userId) {
      setActionStatus("You cannot follow your own profile.");
      return;
    }

    if (followBusyByUid[post.uid]) return;

    setFollowBusyByUid((current) => ({ ...current, [post.uid]: true }));

    try {
      const currentlyFollowing = await isFollowingUser(userId, post.uid);
      if (currentlyFollowing) {
        await unfollowUser(userId, post.uid);
      } else {
        await followUser(
          userId,
          {
            uid: post.uid,
            username: post.authorName || "Arc User",
            photoDataUrl: post.authorPhotoDataUrl || "",
          },
          {
            username: displayName,
            photoDataUrl: profilePhoto,
          },
        );
      }

      const nextFollowing = await isFollowingUser(userId, post.uid);

      setFollowingByUid((current) => ({
        ...current,
        [post.uid]: nextFollowing,
      }));
      setFollowingUsers((current) => {
        if (!nextFollowing) {
          return current.filter((user) => user.uid !== post.uid);
        }

        const alreadyPresent = current.some((user) => user.uid === post.uid);
        if (alreadyPresent) return current;

        return [
          ...current,
          {
            uid: post.uid,
            username: post.authorName || "Arc User",
            photoDataUrl: post.authorPhotoDataUrl || "",
          },
        ];
      });
      setActionStatus(nextFollowing ? "Now following user." : "Unfollowed user.");
    } catch {
      setActionStatus("Unable to update follow right now.");
    } finally {
      setFollowBusyByUid((current) => ({ ...current, [post.uid]: false }));
    }
  };

  const toggleComments = (postId: string) => {
    setExpandedComments((current) => ({
      ...current,
      [postId]: !current[postId],
    }));
  };

  const submitComment = async (post: CommunityPost) => {
    if (!userId) {
      setActionStatus("Log in to comment on posts.");
      return;
    }

    const text = commentDrafts[post.id]?.trim() || "";
    if (!text) return;

    try {
      await createCommunityComment({
        postId: post.id,
        postOwnerUid: post.uid,
        uid: userId,
        authorName: displayName || "Arc User",
        authorPhotoDataUrl: profilePhoto,
        text,
        postCaption: post.caption,
      });

      const refreshedComments = await listCommunityCommentsForPosts([post.id]);
      setCommentsByPost((current) => ({
        ...current,
        [post.id]: refreshedComments[post.id] || [],
      }));
      setCommentDrafts((current) => ({
        ...current,
        [post.id]: "",
      }));
      setExpandedComments((current) => ({
        ...current,
        [post.id]: true,
      }));
      setActionStatus("Comment added.");
    } catch {
      setActionStatus("Unable to add comment right now.");
    }
  };

  const sharePost = async (postId: string) => {
    if (typeof window === "undefined") return;

    const url = `${window.location.origin}/socializing#post-${postId}`;
    try {
      await window.navigator.clipboard.writeText(url);
      setActionStatus("Post link copied.");
    } catch {
      setActionStatus("Unable to copy link in this browser.");
    }
  };

  const editPost = async (post: CommunityPost) => {
    if (!userId) {
      setActionStatus("Log in to edit reports.");
      return;
    }
    if (post.uid !== userId) {
      setActionStatus("You can only edit your own reports.");
      return;
    }

    const nextCaptionRaw = window.prompt("Edit", post.caption);
    if (nextCaptionRaw === null) return;

    const nextCaption = nextCaptionRaw.trim();
    if (!nextCaption) {
      setActionStatus("Report text cannot be empty.");
      return;
    }
    if (nextCaption === post.caption) {
      setActionStatus("No changes made.");
      return;
    }

    setMenuActionPostId(post.id);
    try {
      await updateCommunityPostCaption(post.id, nextCaption);
      setPosts((current) =>
        current.map((candidate) =>
          candidate.id === post.id ? { ...candidate, caption: nextCaption } : candidate,
        ),
      );
      setActionStatus("Report updated.");
    } catch {
      setActionStatus("Unable to edit report right now.");
    } finally {
      setMenuActionPostId(null);
      setActivePostMenuId(null);
    }
  };

  const deletePost = async (post: CommunityPost) => {
    if (!userId) {
      setActionStatus("Log in to delete reports.");
      return;
    }
    if (post.uid !== userId) {
      setActionStatus("You can only delete your own reports.");
      return;
    }
    if (!window.confirm("Delete this report? This action cannot be undone.")) return;

    setMenuActionPostId(post.id);
    try {
      await deleteCommunityPost(post.id);
      setPosts((current) => current.filter((candidate) => candidate.id !== post.id));
      setSidebarProfile((current) =>
        current && post.uid === userId
          ? {
              ...current,
              postCount: Math.max(0, current.postCount - 1),
              mediaCount: Math.max(
                0,
                current.mediaCount - (post.progressPhotoDataUrl?.trim() ? 1 : 0),
              ),
            }
          : current,
      );
      setCommentsByPost((current) => {
        const next = { ...current };
        delete next[post.id];
        return next;
      });
      setLikedPostIds((current) => {
        const next = { ...current };
        delete next[post.id];
        return next;
      });
      setActionStatus("Report deleted.");
    } catch {
      setActionStatus("Unable to delete report right now.");
    } finally {
      setMenuActionPostId(null);
      setActivePostMenuId(null);
    }
  };

  return (
    <main className="w-full px-2 py-4 sm:px-4 sm:py-6">
      <div className="lg:grid lg:grid-cols-[320px_minmax(0,1fr)_320px] lg:items-start lg:gap-6">
        <aside className="lg:sticky lg:top-24">
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start gap-3">
              {sidebarProfile?.photoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sidebarProfile.photoDataUrl}
                  alt={`${sidebarProfile.username} profile`}
                  className="h-14 w-14 rounded-full border border-slate-200 object-cover dark:border-slate-700"
                />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white dark:bg-slate-100 dark:text-slate-900">
                  {getInitials(sidebarProfile?.username || displayName)}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  Your Profile
                </p>
                <h2 className="truncate text-lg font-bold text-slate-900 dark:text-slate-100">
                  {sidebarProfile?.username || displayName}
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {sidebarProfile?.workoutSplit || "Set your split in profile"}
                </p>
              </div>
            </div>

            {userId ? (
              <>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-2xl bg-slate-50 px-3 py-2 text-center dark:bg-slate-800/70">
                    <p className="text-lg font-black text-slate-900 dark:text-slate-100">
                      {isSidebarProfileLoading ? "..." : sidebarProfile?.postCount ?? 0}
                    </p>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Posts</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-2 text-center dark:bg-slate-800/70">
                    <p className="text-lg font-black text-slate-900 dark:text-slate-100">
                      {isSidebarProfileLoading ? "..." : sidebarProfile?.mediaCount ?? 0}
                    </p>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Media</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-2 text-center dark:bg-slate-800/70">
                    <p className="text-lg font-black text-slate-900 dark:text-slate-100">
                      {isSidebarProfileLoading ? "..." : sidebarProfile?.followerCount ?? 0}
                    </p>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Followers</p>
                  </div>
                </div>

                <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                  {sidebarProfile?.bio || "Add a bio so people on Arc can recognize your training style."}
                </p>

                <div className="mt-4 flex gap-2">
                  <Link
                    href="/profile"
                    className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                  >
                    Edit profile
                  </Link>
                  <Link
                    href={`/users/${userId}`}
                    className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    View profile
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                  Log in to see your post, media, and follower counts here.
                </p>
                <Link
                  href="/login"
                  className="mt-4 inline-flex w-full justify-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  Log in
                </Link>
              </>
            )}
          </section>
        </aside>

        <div className="mt-4 lg:col-start-2 lg:mt-0">
          <div className="mx-auto max-w-5xl space-y-4 rounded-[2rem] bg-[radial-gradient(circle_at_15%_0%,rgba(15,23,42,0.22),transparent_42%),radial-gradient(circle_at_86%_8%,rgba(8,47,73,0.16),transparent_36%)] p-1.5 sm:p-2">
      <header className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{heading}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              void loadPosts(true);
            }}
            disabled={isRefreshing}
            className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        {actionStatus ? (
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{actionStatus}</p>
        ) : null}
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex gap-4 overflow-x-auto pb-1">
          {storyProfiles.map((profile) => {
            const initials = getInitials(profile.name);
            return (
              <div key={`${profile.uid}:${profile.name}`} className="flex min-w-16 flex-col items-center gap-1 text-center">
                <div className="rounded-full bg-[linear-gradient(140deg,#0f172a,#111827,#334155)] p-[2px]">
                  <div className="rounded-full bg-white p-[2px] dark:bg-slate-900">
                    {profile.uid ? (
                      <Link href={`/users/${profile.uid}`} aria-label={`Open ${profile.name}'s profile`}>
                        {profile.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={profile.photo}
                            alt={`${profile.name} story`}
                            className="h-14 w-14 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">
                            {initials}
                          </span>
                        )}
                      </Link>
                    ) : profile.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profile.photo}
                        alt={`${profile.name} story`}
                        className="h-14 w-14 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">
                        {initials}
                      </span>
                    )}
                  </div>
                </div>
                <p className="max-w-16 truncate text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  {profile.name}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="rounded-2xl bg-[linear-gradient(135deg,rgba(15,23,42,0.18),rgba(15,23,42,0.04))] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Arc Heat</p>
          <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{posts.length}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Total posts</p>
        </div>
        <div className="rounded-2xl bg-[linear-gradient(135deg,rgba(17,24,39,0.18),rgba(17,24,39,0.04))] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">This Week</p>
          <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{last7DaysPosts}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Fresh updates</p>
        </div>
        <div className="rounded-2xl bg-[linear-gradient(135deg,rgba(30,41,59,0.18),rgba(30,41,59,0.04))] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Photo Mix</p>
          <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{photoPostRatio}%</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">With visuals</p>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="home-search"
            className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300"
          >
            Search Users And Posts
          </label>
          <div className="relative flex gap-2">
            <div className="min-w-0 flex-1">
              <input
                id="home-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by username, post caption, or post ID..."
                className="min-w-0 w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 focus:ring dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100"
              />
              {normalizedSearch && usernameSuggestions.length > 0 ? (
                <ul className="absolute left-0 right-[90px] top-11 z-20 max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  {usernameSuggestions.map((suggestion) => (
                    <li key={`${suggestion.uid}:${suggestion.name}`}>
                      <Link
                        href={suggestion.uid ? `/users/${suggestion.uid}` : "#"}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setSearchQuery(suggestion.name);
                        }}
                        onClick={() => {
                          setSearchQuery(suggestion.name);
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {suggestion.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={suggestion.photo}
                            alt={`${suggestion.name} avatar`}
                            className="h-7 w-7 rounded-full border border-slate-200 object-cover dark:border-slate-700"
                          />
                        ) : (
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
                            {getInitials(suggestion.name)}
                          </span>
                        )}
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{suggestion.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                }}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Clear
              </button>
            ) : null}
          </div>
          {normalizedSearch ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {totalSearchMatches} result{totalSearchMatches === 1 ? "" : "s"} for &quot;{searchQuery.trim()}&quot;
              {matchedUsers.length > 0 ? ` · Users: ${matchedUsers.join(", ")}` : ""}
            </p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Type to find a user or specific post.
            </p>
          )}
        </div>
        {normalizedSearch && usernameSuggestions.length > 0 ? (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">
              Matching Users
            </p>
            <div className="space-y-1">
              {usernameSuggestions.map((suggestion) => (
                <Link
                  key={`result:${suggestion.uid}:${suggestion.name}`}
                  href={suggestion.uid ? `/users/${suggestion.uid}` : "#"}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white dark:hover:bg-slate-900"
                >
                  {suggestion.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={suggestion.photo}
                      alt={`${suggestion.name} avatar`}
                      className="h-9 w-9 rounded-full border border-slate-200 object-cover dark:border-slate-700"
                    />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
                      {getInitials(suggestion.name)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {suggestion.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Open profile</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="flex items-start gap-3">
            {profilePhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profilePhoto}
                alt={`${displayName} profile`}
                className="h-10 w-10 rounded-full border border-slate-200 object-cover dark:border-slate-700"
              />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-white dark:text-slate-900">
                {getInitials(displayName)}
              </span>
            )}
            <textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder={userId ? "Share a training update..." : "Log in to post."}
              className="min-h-24 flex-1 rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 focus:ring dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100"
              maxLength={400}
              disabled={!userId || isSubmitting}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPhotoSelected}
                disabled={!userId || isSubmitting}
              />
              Add Photo
            </label>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-full bg-[linear-gradient(135deg,#0f172a,#111827,#1e293b)] px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Posting..." : "Post"}
            </button>
            {!userId ? <p className="text-xs text-slate-500 dark:text-slate-400">You need an account to post.</p> : null}
          </div>

          {photoError ? <p className="text-xs text-rose-600 dark:text-rose-300">{photoError}</p> : null}

          {photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoPreview}
              alt="Selected upload preview"
              className="max-h-80 w-full rounded-2xl border border-slate-200 object-cover dark:border-slate-700"
            />
          ) : null}

          {formStatus ? (
            <p
              className={`rounded-xl border px-3 py-2 text-xs ${
                formStatus.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200"
                  : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200"
              }`}
            >
              {formStatus.message}
            </p>
          ) : null}
        </form>
      </section>
      {isLoadingPosts ? (
        <p className="px-1 text-sm text-slate-500 dark:text-slate-400">Loading posts...</p>
      ) : posts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          No community posts yet. Share the first update.
        </p>
      ) : normalizedSearch && filteredPosts.length === 0 && usernameSuggestions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          No posts matched &quot;{searchQuery.trim()}&quot;. Try another username, caption keyword, or post ID.
        </p>
      ) : normalizedSearch && filteredPosts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          No posts matched &quot;{searchQuery.trim()}&quot;, but matching users were found above.
        </p>
      ) : (
        <ul className="space-y-4">
          {filteredPosts.map((post, index) => {
            const initials = getInitials(post.authorName || "Arc");
            const isLiked = Boolean(likedPostIds[post.id]);
            const postComments = commentsByPost[post.id] || [];
            const isCommentsOpen = Boolean(expandedComments[post.id]);
            const isPostOwner = userId === post.uid;
            const accentClass =
              index % 3 === 0
                ? "from-slate-900/30 to-slate-900/0"
                : index % 3 === 1
                  ? "from-slate-700/30 to-slate-700/0"
                  : "from-cyan-900/30 to-cyan-900/0";

            return (
              <li
                key={post.id}
                id={`post-${post.id}`}
                className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
              >
                <div className={`h-1 w-full bg-gradient-to-r ${accentClass}`} />
                <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <div className="flex min-w-0 items-center gap-3.5">
                    <Link href={`/users/${post.uid}`} className="shrink-0" aria-label="Open user profile">
                      {post.authorPhotoDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.authorPhotoDataUrl}
                          alt={`${post.authorName || "User"} avatar`}
                          className="h-11 w-11 rounded-full border border-slate-200 object-cover dark:border-slate-700"
                        />
                      ) : (
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-white dark:text-slate-900">
                          {initials}
                        </span>
                      )}
                    </Link>
                    <div className="min-w-0">
                      <Link
                        href={`/users/${post.uid}`}
                        className="truncate text-base font-bold leading-tight text-slate-900 hover:underline dark:text-slate-100"
                      >
                        {post.authorName || "Arc User"}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {formatTimestamp(post.createdAt)}
                      </p>
                    </div>
                    {userId && post.uid !== userId ? (
                      <button
                        type="button"
                        onClick={() => {
                          void toggleFollow(post);
                        }}
                        disabled={Boolean(followBusyByUid[post.uid])}
                        className={`ml-1 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
                          followingByUid[post.uid]
                            ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            : "border-slate-900 bg-slate-900 text-white hover:bg-slate-800 dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        {followBusyByUid[post.uid]
                          ? "..."
                          : followingByUid[post.uid]
                            ? "Following"
                            : "Follow"}
                      </button>
                    ) : null}
                  </div>
                  {isPostOwner ? (
                    <div className="relative" data-post-menu-root>
                      <button
                        type="button"
                        onClick={() =>
                          setActivePostMenuId((current) => (current === post.id ? null : post.id))
                        }
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-lg transition ${
                          activePostMenuId === post.id
                            ? "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100"
                            : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                        }`}
                        aria-label="Open post menu"
                        title="More actions"
                      >
                        ⋯
                      </button>
                      {activePostMenuId === post.id ? (
                        <div className="absolute right-0 top-9 z-20 w-36 rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
                          <button
                            type="button"
                            onClick={() => {
                              void editPost(post);
                            }}
                            disabled={menuActionPostId === post.id}
                            className="w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-100 dark:hover:bg-slate-800"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void deletePost(post);
                            }}
                            disabled={menuActionPostId === post.id}
                            className="w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-300 dark:hover:bg-rose-950/40"
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {post.progressPhotoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.progressPhotoDataUrl}
                    alt="Progress update"
                    className="max-h-[560px] w-full border-y border-slate-200 object-cover dark:border-slate-700"
                  />
                ) : null}

                <div className="space-y-2 px-4 py-3">
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">
                    <span className="mr-1 font-semibold">{post.authorName || "Arc User"}</span>
                    {post.caption}
                  </p>
                  <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-200">
                    <button
                      type="button"
                      onClick={() => toggleLike(post.id)}
                      className={`flex h-9 w-9 items-center justify-center rounded-full border text-lg transition ${
                        isLiked
                          ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                          : "border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      }`}
                      aria-label={isLiked ? "Unlike post" : "Like post"}
                      title={isLiked ? "Unlike" : "Like"}
                    >
                      {"🔥"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleComments(post.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      aria-label="Open comments"
                      title="Comments"
                    >
                      💬
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void sharePost(post.id);
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      aria-label="Share post"
                      title="Share"
                    >
                      ↗
                    </button>
                    <span className="ml-auto rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      Lift Log
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isLiked ? "You liked this post" : "Tap fire to like"} · {postComments.length} comments
                  </p>
                  {isCommentsOpen ? (
                    <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                      {postComments.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">No comments yet.</p>
                      ) : (
                        <ul className="space-y-1">
                          {postComments.map((comment) => (
                            <li key={comment.id} className="rounded-xl bg-white px-2 py-1.5 text-xs text-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
                              <p>
                                <span className="font-semibold">{comment.authorName || "Arc User"}</span> {comment.text}
                              </p>
                              <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                {formatCommentTimestamp(comment.createdAt)}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}

                      <form
                        className="flex gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          submitComment(post);
                        }}
                      >
                        <input
                          type="text"
                          value={commentDrafts[post.id] || ""}
                          onChange={(event) =>
                            setCommentDrafts((current) => ({
                              ...current,
                              [post.id]: event.target.value,
                            }))
                          }
                          placeholder={userId ? "Write a comment..." : "Log in to comment."}
                          disabled={!userId}
                          className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none ring-slate-300 focus:ring dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        />
                        <button
                          type="submit"
                          disabled={!userId || !(commentDrafts[post.id] || "").trim()}
                          className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                        >
                          Comment
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
          </div>
        </div>

        <div className="hidden lg:block" aria-hidden="true" />

      </div>
    </main>
  );
}
