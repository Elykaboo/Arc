"use client";

import { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { subscribeMemberProfiles, type MemberProfile } from "@/lib/member-db";
import { createUserNotification } from "@/lib/notification-db";
import { loadUserProfile } from "@/lib/profile-db";
import { weekdays } from "@/lib/routine-templates";
import {
  createCommunityComment,
  getCommunityLikeSummaryForPost,
  createCommunityPost,
  deleteCommunityComment,
  deleteCommunityPost,
  getCommunityPostById,
  getCommunityPostPhotoDataUrls,
  likeCommunityComment,
  likeCommunityPost,
  listCommunityCommentLikeSummaries,
  listCommunityCommentCountsForPosts,
  listCommunityCommentsForPosts,
  listCommunityLikeSummariesForPosts,
  listCommunityLikesForPost,
  listCommunityPosts,
  listCommunityPostsByUser,
  unlikeCommunityComment,
  unlikeCommunityPost,
  updateCommunityPostCaption,
  type CommunityComment,
  type CommunityLike,
  type CommunityPost,
} from "@/lib/community-db";

// Firestore document limit is 1 MiB; keep image payload well below that when base64-encoded.
const MAX_UPLOAD_PHOTOS = 6;
const MAX_PREVIEW_PHOTO_DATA_URL_BYTES = 160_000;
const MAX_TOTAL_PHOTO_DATA_URL_BYTES = 720_000;
const PHOTO_FRAME_ASPECT_RATIO = 4 / 5;
const INITIAL_VISIBLE_COMMENTS = 4;
const COMMENTS_PAGE_STEP = 6;

type CropSettings = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

type PhotoDraft = {
  id: string;
  fileName: string;
  originalDataUrl: string;
  width: number;
  height: number;
  crop: CropSettings;
  previewDataUrl: string;
};

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

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const readFileAsDataUrl = async (file: File): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
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
};

const loadImageFromDataUrl = async (dataUrl: string): Promise<HTMLImageElement> => {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Unable to load image."));
    img.src = dataUrl;
  });
};

const getBaseCropDimensions = (
  width: number,
  height: number,
  targetAspectRatio = PHOTO_FRAME_ASPECT_RATIO,
): { width: number; height: number } => {
  const sourceAspectRatio = width / height;

  if (sourceAspectRatio > targetAspectRatio) {
    return {
      width: height * targetAspectRatio,
      height,
    };
  }

  return {
    width,
    height: width / targetAspectRatio,
  };
};

const renderCroppedImageDataUrl = async (
  draft: Pick<PhotoDraft, "originalDataUrl" | "width" | "height" | "crop">,
  maxBytes: number,
): Promise<string> => {
  const image = await loadImageFromDataUrl(draft.originalDataUrl);
  const baseCrop = getBaseCropDimensions(draft.width, draft.height);
  const cropWidth = Math.max(1, baseCrop.width / draft.crop.zoom);
  const cropHeight = Math.max(1, baseCrop.height / draft.crop.zoom);
  const maxOffsetX = Math.max(0, (draft.width - cropWidth) / 2);
  const maxOffsetY = Math.max(0, (draft.height - cropHeight) / 2);
  const sourceX = clamp((draft.width - cropWidth) / 2 + draft.crop.offsetX * maxOffsetX, 0, draft.width - cropWidth);
  const sourceY = clamp((draft.height - cropHeight) / 2 + draft.crop.offsetY * maxOffsetY, 0, draft.height - cropHeight);

  let targetWidth = Math.min(960, Math.round(cropWidth));
  let targetHeight = Math.round(targetWidth / PHOTO_FRAME_ASPECT_RATIO);
  if (targetHeight > 1200) {
    targetHeight = 1200;
    targetWidth = Math.round(targetHeight * PHOTO_FRAME_ASPECT_RATIO);
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to process image.");
  }

  let quality = 0.86;
  let result = "";

  while (true) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    context.clearRect(0, 0, targetWidth, targetHeight);
    context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight);
    result = canvas.toDataURL("image/jpeg", quality);

    if (dataUrlStringBytes(result) <= maxBytes && dataUrlToBytes(result) <= maxBytes) {
      return result;
    }

    if (quality > 0.34) {
      quality -= 0.08;
      continue;
    }

    if (targetWidth <= 480) {
      break;
    }

    targetWidth = Math.max(480, Math.round(targetWidth * 0.86));
    targetHeight = Math.round(targetWidth / PHOTO_FRAME_ASPECT_RATIO);
    quality = 0.82;
  }

  throw new Error("Image is still too large after compression. Try a smaller photo.");
};

const getInteractiveCropLayout = (
  width: number,
  height: number,
  crop: CropSettings,
): {
  widthPercent: number;
  heightPercent: number;
  leftPercent: number;
  topPercent: number;
} => {
  const sourceAspectRatio = width / height;
  const frameAspectRatio = PHOTO_FRAME_ASPECT_RATIO;

  let baseWidthPercent = 100;
  let baseHeightPercent = 100;

  if (sourceAspectRatio > frameAspectRatio) {
    baseWidthPercent = (sourceAspectRatio / frameAspectRatio) * 100;
  } else {
    baseHeightPercent = (frameAspectRatio / sourceAspectRatio) * 100;
  }

  const widthPercent = baseWidthPercent * crop.zoom;
  const heightPercent = baseHeightPercent * crop.zoom;
  const maxOffsetPercentX = Math.max(0, (widthPercent - 100) / 2);
  const maxOffsetPercentY = Math.max(0, (heightPercent - 100) / 2);

  return {
    widthPercent,
    heightPercent,
    leftPercent: 50 - crop.offsetX * maxOffsetPercentX,
    topPercent: 50 - crop.offsetY * maxOffsetPercentY,
  };
};

const createPhotoDraft = async (file: File): Promise<PhotoDraft> => {
  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromDataUrl(originalDataUrl);
  const crop: CropSettings = { zoom: 1, offsetX: 0, offsetY: 0 };
  const previewDataUrl = await renderCroppedImageDataUrl(
    {
      originalDataUrl,
      width: image.width,
      height: image.height,
      crop,
    },
    MAX_PREVIEW_PHOTO_DATA_URL_BYTES,
  );

  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    fileName: file.name,
    originalDataUrl,
    width: image.width,
    height: image.height,
    crop,
    previewDataUrl,
  };
};

type CommunityClientProps = {
  heading?: string;
  description?: string;
  showTrainingSidebar?: boolean;
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

type ResolvedIdentity = {
  name: string;
  photo: string;
};

export default function CommunityClient({
  heading = "Community",
  description = "Share progress photos, milestones, and small wins with everyone training on Arc.",
  showTrainingSidebar = false,
}: CommunityClientProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("Guest");
  const [profilePhoto, setProfilePhoto] = useState("");

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [caption, setCaption] = useState("");
  const [photoDrafts, setPhotoDrafts] = useState<PhotoDraft[]>([]);
  const [activeCropPhotoId, setActiveCropPhotoId] = useState<string | null>(null);
  const [cropDraft, setCropDraft] = useState<CropSettings | null>(null);
  const [isCropSaving, setIsCropSaving] = useState(false);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formStatus, setFormStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [likedPostIds, setLikedPostIds] = useState<Record<string, boolean>>({});
  const [likeCountsByPost, setLikeCountsByPost] = useState<Record<string, number>>({});
  const [likesByPost, setLikesByPost] = useState<Record<string, CommunityLike[]>>({});
  const [likesLoadingByPost, setLikesLoadingByPost] = useState<Record<string, boolean>>({});
  const [likesOverlayPostId, setLikesOverlayPostId] = useState<string | null>(null);
  const [likeBusyPostId, setLikeBusyPostId] = useState<string | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, CommunityComment[]>>({});
  const [commentCountsByPost, setCommentCountsByPost] = useState<Record<string, number>>({});
  const [commentLikeCountsByComment, setCommentLikeCountsByComment] = useState<Record<string, number>>({});
  const [likedCommentIds, setLikedCommentIds] = useState<Record<string, boolean>>({});
  const [commentsLoadingByPost, setCommentsLoadingByPost] = useState<Record<string, boolean>>({});
  const [visibleCommentsByPost, setVisibleCommentsByPost] = useState<Record<string, number>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [replyDraftsByComment, setReplyDraftsByComment] = useState<Record<string, string>>({});
  const [activeReplyCommentIdByPost, setActiveReplyCommentIdByPost] = useState<Record<string, string | null>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [activePhotoIndexByPost, setActivePhotoIndexByPost] = useState<Record<string, number>>({});
  const [commentDeleteBusyId, setCommentDeleteBusyId] = useState<string | null>(null);
  const [commentLikeBusyId, setCommentLikeBusyId] = useState<string | null>(null);
  const [commentSubmitBusyPostId, setCommentSubmitBusyPostId] = useState<string | null>(null);
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
  const [brokenAvatarKeys, setBrokenAvatarKeys] = useState<Record<string, boolean>>({});
  const [activityLog, setActivityLog] = useState<Record<string, "attended" | "missed">>({});
  const cropDragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
    maxTranslateX: number;
    maxTranslateY: number;
  } | null>(null);

  const refreshCommentsForPost = async (postId: string, force = false) => {
    if (!force && Object.prototype.hasOwnProperty.call(commentsByPost, postId)) return;

    setCommentsLoadingByPost((current) => ({ ...current, [postId]: true }));
    try {
      const refreshedComments = await listCommunityCommentsForPosts([postId]);
      const nextComments = refreshedComments[postId] || [];
      let likeSummary: { counts: Record<string, number>; likedByViewer: Record<string, boolean> } = {
        counts: {},
        likedByViewer: {},
      };
      try {
        likeSummary = await listCommunityCommentLikeSummaries(
          nextComments.map((comment) => comment.id),
          userId,
        );
      } catch {
        // Keep comments visible if comment-like collection rules are not deployed yet.
      }
      setCommentsByPost((current) => ({
        ...current,
        [postId]: nextComments,
      }));
      setCommentCountsByPost((current) => ({
        ...current,
        [postId]: nextComments.length,
      }));
      setCommentLikeCountsByComment((current) => ({
        ...current,
        ...likeSummary.counts,
      }));
      setLikedCommentIds((current) => {
        const next = { ...current };
        for (const comment of nextComments) {
          next[comment.id] = Boolean(likeSummary.likedByViewer[comment.id]);
        }
        return next;
      });
    } finally {
      setCommentsLoadingByPost((current) => ({ ...current, [postId]: false }));
    }
  };

  useEffect(() => {
    if (!showTrainingSidebar || typeof window === "undefined") {
      setActivityLog({});
      return;
    }

    const storagePrefix = `homeActivity:${userId ?? "guest"}:`;
    const merged: Record<string, "attended" | "missed"> = {};

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith(storagePrefix)) continue;

      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") continue;
        for (const [iso, status] of Object.entries(parsed)) {
          if ((status === "attended" || status === "missed") && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
            merged[iso] = status;
          }
        }
      } catch {
        // Ignore malformed local activity records.
      }
    }

    setActivityLog(merged);
  }, [showTrainingSidebar, userId]);

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
          mediaCount: userPosts.filter((post) => getCommunityPostPhotoDataUrls(post).length > 0).length,
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
      setCommentCountsByPost({});
      return;
    }

    let cancelled = false;

    const loadCommentCounts = async () => {
      try {
        const counts = await listCommunityCommentCountsForPosts(visiblePostIds);
        if (!cancelled) {
          setCommentCountsByPost(counts);
        }
      } catch {
        if (!cancelled) {
          setCommentCountsByPost({});
        }
      }
    };

    void loadCommentCounts();

    return () => {
      cancelled = true;
    };
  }, [posts, userId]);

  useEffect(() => {
    const visiblePostIds = new Set(posts.map((post) => post.id));
    setLikeCountsByPost((current) => {
      const next: Record<string, number> = {};
      for (const [postId, count] of Object.entries(current)) {
        if (visiblePostIds.has(postId)) {
          next[postId] = count;
        }
      }
      return next;
    });
    setLikedPostIds((current) => {
      const next: Record<string, boolean> = {};
      for (const [postId, liked] of Object.entries(current)) {
        if (visiblePostIds.has(postId)) {
          next[postId] = liked;
        }
      }
      return next;
    });
    setLikesByPost((current) => {
      const next: Record<string, CommunityLike[]> = {};
      for (const [postId, likes] of Object.entries(current)) {
        if (visiblePostIds.has(postId)) {
          next[postId] = likes;
        }
      }
      return next;
    });
    setLikesLoadingByPost((current) => {
      const next: Record<string, boolean> = {};
      for (const [postId, loading] of Object.entries(current)) {
        if (visiblePostIds.has(postId)) {
          next[postId] = loading;
        }
      }
      return next;
    });
    setCommentsByPost((current) => {
      const next: Record<string, CommunityComment[]> = {};
      for (const [postId, comments] of Object.entries(current)) {
        if (visiblePostIds.has(postId)) {
          next[postId] = comments;
        }
      }
      return next;
    });
    setCommentCountsByPost((current) => {
      const next: Record<string, number> = {};
      for (const [postId, count] of Object.entries(current)) {
        if (visiblePostIds.has(postId)) {
          next[postId] = count;
        }
      }
      return next;
    });
    setCommentsLoadingByPost((current) => {
      const next: Record<string, boolean> = {};
      for (const [postId, loading] of Object.entries(current)) {
        if (visiblePostIds.has(postId)) {
          next[postId] = loading;
        }
      }
      return next;
    });
  }, [posts, userId]);

  useEffect(() => {
    const allCommentIds = Object.values(commentsByPost).flatMap((comments) =>
      comments.map((comment) => comment.id),
    );
    if (allCommentIds.length === 0) return;

    let cancelled = false;

    const refreshCommentLikes = async () => {
      try {
        const summary = await listCommunityCommentLikeSummaries(allCommentIds, userId);
        if (cancelled) return;
        setCommentLikeCountsByComment((current) => ({ ...current, ...summary.counts }));
        setLikedCommentIds((current) => {
          const next = { ...current };
          for (const commentId of allCommentIds) {
            next[commentId] = Boolean(summary.likedByViewer[commentId]);
          }
          return next;
        });
      } catch {
        // Keep existing values if comment-like summary refresh fails.
      }
    };

    void refreshCommentLikes();

    return () => {
      cancelled = true;
    };
  }, [commentsByPost, userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    const openHashLinkedPost = async () => {
      const hash = window.location.hash.trim();
      if (!hash.startsWith("#post-")) return;

      const postId = hash.slice("#post-".length).trim();
      if (!postId) return;

      const existingPost = posts.find((post) => post.id === postId);

      try {
        const targetPost = existingPost ?? (await getCommunityPostById(postId));
        if (cancelled || !targetPost) return;

        if (!existingPost) {
          setPosts((current) => {
            const next = current.filter((candidate) => candidate.id !== targetPost.id);
            next.push(targetPost);
            next.sort((left, right) => {
              const leftTime = left.createdAt?.toMillis?.() ?? 0;
              const rightTime = right.createdAt?.toMillis?.() ?? 0;
              return rightTime - leftTime;
            });
            return next;
          });
        }

        const refreshedComments = await listCommunityCommentsForPosts([postId]);
        if (cancelled) return;
        const nextComments = refreshedComments[postId] || [];
        let likeSummary: { counts: Record<string, number>; likedByViewer: Record<string, boolean> } = {
          counts: {},
          likedByViewer: {},
        };
        try {
          likeSummary = await listCommunityCommentLikeSummaries(
            nextComments.map((comment) => comment.id),
            userId,
          );
        } catch {
          // Keep comments visible if comment-like collection rules are not deployed yet.
        }
        if (cancelled) return;

        setCommentsByPost((current) => ({
          ...current,
          [postId]: nextComments,
        }));
        setCommentCountsByPost((current) => ({
          ...current,
          [postId]: nextComments.length,
        }));
        setCommentLikeCountsByComment((current) => ({
          ...current,
          ...likeSummary.counts,
        }));
        setLikedCommentIds((current) => {
          const next = { ...current };
          for (const comment of nextComments) {
            next[comment.id] = Boolean(likeSummary.likedByViewer[comment.id]);
          }
          return next;
        });

        setExpandedComments((current) => ({
          ...current,
          [postId]: true,
        }));

        window.requestAnimationFrame(() => {
          const target = document.getElementById(`post-${postId}`);
          target?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } catch {
        // Ignore broken or stale deep links.
      }
    };

    const handleHashChange = () => {
      void openHashLinkedPost();
    };

    void openHashLinkedPost();
    window.addEventListener("hashchange", handleHashChange);

    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [posts, userId]);

  useEffect(() => {
    const unsubscribe = subscribeMemberProfiles(
      (profiles) => {
        setMemberProfiles(profiles);
      },
      () => {
        setMemberProfiles([]);
      },
      4000,
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{
        username?: string;
        bio?: string;
        workoutSplit?: string;
        photoDataUrl?: string;
      }>).detail;

      if (!userId || !detail) return;

      const nextName =
        detail.username?.trim() ||
        auth.currentUser?.displayName?.trim() ||
        auth.currentUser?.email?.split("@")[0] ||
        "Arc User";
      const nextPhoto = detail.photoDataUrl?.trim() || "";

      setDisplayName(nextName);
      setProfilePhoto(nextPhoto);
      setMemberProfiles((current) => {
        const next = current.filter((profile) => profile.uid !== userId);
        next.push({
          uid: userId,
          username: nextName,
          bio: detail.bio?.trim() || "",
          workoutSplit: detail.workoutSplit?.trim() || "",
          photoDataUrl: nextPhoto,
        });
        return next;
      });
    };

    window.addEventListener("profile-updated", onProfileUpdated as EventListener);
    return () => {
      window.removeEventListener("profile-updated", onProfileUpdated as EventListener);
    };
  }, [userId]);

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
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    const availableSlots = MAX_UPLOAD_PHOTOS - photoDrafts.length;
    if (availableSlots <= 0) {
      setPhotoError(`You can upload up to ${MAX_UPLOAD_PHOTOS} photos per post.`);
      return;
    }

    const acceptedFiles = files.slice(0, availableSlots);
    const rejectedFile = acceptedFiles.find((file) => !file.type.startsWith("image/"));
    if (rejectedFile) {
      setPhotoError("Please upload image files only.");
      return;
    }

    setPhotoError(
      files.length > availableSlots ? `Only the first ${availableSlots} photo${availableSlots === 1 ? "" : "s"} were added.` : null,
    );

    try {
      const nextDrafts = await Promise.all(acceptedFiles.map((file) => createPhotoDraft(file)));
      setPhotoDrafts((current) => [...current, ...nextDrafts]);
      if (nextDrafts[0]) {
        setActiveCropPhotoId(nextDrafts[0].id);
        setCropDraft(nextDrafts[0].crop);
      }
    } catch (error: unknown) {
      setPhotoError(error instanceof Error ? error.message : "Unable to process selected image.");
    }
  };

  const removePhotoDraft = (photoId: string) => {
    setPhotoDrafts((current) => current.filter((draft) => draft.id !== photoId));
    setPhotoError(null);
    setActiveCropPhotoId((current) => (current === photoId ? null : current));
  };

  const saveCropChanges = async () => {
    if (!activeCropPhoto || !cropDraft) return;

    setIsCropSaving(true);
    try {
      const previewDataUrl = await renderCroppedImageDataUrl(
        {
          originalDataUrl: activeCropPhoto.originalDataUrl,
          width: activeCropPhoto.width,
          height: activeCropPhoto.height,
          crop: cropDraft,
        },
        MAX_PREVIEW_PHOTO_DATA_URL_BYTES,
      );

      setPhotoDrafts((current) =>
        current.map((draft) =>
          draft.id === activeCropPhoto.id
            ? {
                ...draft,
                crop: cropDraft,
                previewDataUrl,
              }
            : draft,
        ),
      );
      setPhotoError(null);
      setActiveCropPhotoId(null);
    } catch (error: unknown) {
      setPhotoError(error instanceof Error ? error.message : "Unable to crop selected image.");
    } finally {
      setIsCropSaving(false);
    }
  };

  const startCropDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!activeCropPhoto || !cropDraft || !activeCropLayout) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const displayWidthPx = (activeCropLayout.widthPercent / 100) * bounds.width;
    const displayHeightPx = (activeCropLayout.heightPercent / 100) * bounds.height;

    cropDragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: cropDraft.offsetX,
      startOffsetY: cropDraft.offsetY,
      maxTranslateX: Math.max(0, (displayWidthPx - bounds.width) / 2),
      maxTranslateY: Math.max(0, (displayHeightPx - bounds.height) / 2),
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDraggingCrop(true);
  };

  const moveCropDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = cropDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;

    setCropDraft((current) =>
      current
        ? {
            ...current,
            offsetX:
              dragState.maxTranslateX > 0
                ? clamp(dragState.startOffsetX - deltaX / dragState.maxTranslateX, -1, 1)
                : 0,
            offsetY:
              dragState.maxTranslateY > 0
                ? clamp(dragState.startOffsetY - deltaY / dragState.maxTranslateY, -1, 1)
                : 0,
          }
        : current,
    );
  };

  const endCropDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (cropDragStateRef.current?.pointerId !== event.pointerId) return;

    cropDragStateRef.current = null;
    setIsDraggingCrop(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const canSubmit = useMemo(() => {
    return Boolean(userId && caption.trim().length > 0 && !isSubmitting);
  }, [caption, isSubmitting, userId]);

  const activeCropPhoto = useMemo(
    () => photoDrafts.find((draft) => draft.id === activeCropPhotoId) ?? null,
    [activeCropPhotoId, photoDrafts],
  );
  const activeCropLayout = useMemo(
    () =>
      activeCropPhoto && cropDraft
        ? getInteractiveCropLayout(activeCropPhoto.width, activeCropPhoto.height, cropDraft)
        : null,
    [activeCropPhoto, cropDraft],
  );

  useEffect(() => {
    if (!activeCropPhoto) {
      setCropDraft(null);
      setIsDraggingCrop(false);
      cropDragStateRef.current = null;
      return;
    }

    setCropDraft(activeCropPhoto.crop);
  }, [activeCropPhoto]);

  const memberProfilesByUid = useMemo(() => {
    return memberProfiles.reduce<Record<string, MemberProfile>>((accumulator, profile) => {
      if (!profile.uid) return accumulator;
      accumulator[profile.uid] = profile;
      return accumulator;
    }, {});
  }, [memberProfiles]);

  const resolveIdentity = useCallback((
    uid: string | null | undefined,
    fallbackName: string,
    fallbackPhoto: string,
  ): ResolvedIdentity => {
    const liveProfile = uid ? memberProfilesByUid[uid] : undefined;
    const resolvedName = liveProfile?.username?.trim() || fallbackName.trim() || "Arc User";
    const resolvedPhoto = liveProfile?.photoDataUrl?.trim() || fallbackPhoto.trim();

    return {
      name: resolvedName,
      photo: resolvedPhoto,
    };
  }, [memberProfilesByUid]);

  const storyProfiles = useMemo(() => {
    const currentUserIdentity = resolveIdentity(userId, displayName, profilePhoto);
    const currentUserProfile = {
      uid: userId ?? "",
      name: currentUserIdentity.name,
      photo: currentUserIdentity.photo,
    };
    const followedProfiles = followingUsers
      .filter((followedUser) => followedUser.uid !== userId)
      .map((followedUser) => {
        const resolvedIdentity = resolveIdentity(
          followedUser.uid,
          followedUser.username || "Arc User",
          followedUser.photoDataUrl || "",
        );

        return {
          uid: followedUser.uid,
          name: resolvedIdentity.name,
          photo: resolvedIdentity.photo,
        };
      });
    return [currentUserProfile, ...followedProfiles].slice(0, 9);
  }, [displayName, followingUsers, profilePhoto, resolveIdentity, userId]);

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
    const withPhoto = posts.filter((post) => getCommunityPostPhotoDataUrls(post).length > 0).length;
    return Math.round((withPhoto / posts.length) * 100);
  }, [posts]);

  const sidebarWeekdayActivity = useMemo(() => {
    if (!showTrainingSidebar) return [];

    const currentDayIndex = new Date().getDay();
    const todayDay = weekdays.find((day, index) => ((index + 1) % 7) === currentDayIndex) ?? weekdays[0];
    const orderedDays = [...weekdays.filter((day) => day !== todayDay), todayDay];
    const start = new Date();
    start.setDate(start.getDate() - 364);
    const end = new Date();

    return orderedDays.map((day) => {
      const dayIndex = (weekdays.indexOf(day) + 1) % 7;
      let attended = 0;
      const cursor = new Date(start);

      while (cursor <= end) {
        const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        if (cursor.getDay() === dayIndex && activityLog[iso] === "attended") {
          attended += 1;
        }
        cursor.setDate(cursor.getDate() + 1);
      }

      return { day, attended, isToday: day === todayDay };
    });
  }, [activityLog, showTrainingSidebar]);

  const maxSidebarWeekdayAttendance = useMemo(
    () => Math.max(...sidebarWeekdayActivity.map((row) => row.attended), 1),
    [sidebarWeekdayActivity],
  );

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
  const discoverProfiles = useMemo(() => {
    return searchableUsers
      .filter((profile) => profile.uid && profile.uid !== userId && !followingByUid[profile.uid])
      .slice(0, 5);
  }, [followingByUid, searchableUsers, userId]);
  const composerCharacterCount = caption.trim().length;
  const visibleFeedCount = normalizedSearch ? filteredPosts.length : posts.length;
  const overlayPost = likesOverlayPostId ? posts.find((post) => post.id === likesOverlayPostId) ?? null : null;
  const overlayLikes = likesOverlayPostId ? likesByPost[likesOverlayPostId] || [] : [];
  const overlayLikesLoading = likesOverlayPostId ? Boolean(likesLoadingByPost[likesOverlayPostId]) : false;
  const overlayLikeCount = likesOverlayPostId ? (likeCountsByPost[likesOverlayPostId] ?? overlayLikes.length) : 0;

  useEffect(() => {
    const visiblePostIds = posts.map((post) => post.id);
    if (visiblePostIds.length === 0) {
      setLikeCountsByPost({});
      setLikedPostIds({});
      return;
    }

    let cancelled = false;
    const loadLikeSummaries = async () => {
      try {
        const summary = await listCommunityLikeSummariesForPosts(visiblePostIds, userId);
        if (cancelled) return;
        setLikeCountsByPost(summary.counts);
        setLikedPostIds(summary.likedByViewer);
      } catch {
        if (cancelled) return;
        setLikeCountsByPost({});
        setLikedPostIds({});
      }
    };

    void loadLikeSummaries();

    return () => {
      cancelled = true;
    };
  }, [posts, userId]);

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
      const progressPhotoDataUrls = await Promise.all(
        photoDrafts.map((draft) =>
          renderCroppedImageDataUrl(
            {
              originalDataUrl: draft.originalDataUrl,
              width: draft.width,
              height: draft.height,
              crop: draft.crop,
            },
            Math.max(90_000, Math.floor(MAX_TOTAL_PHOTO_DATA_URL_BYTES / Math.max(photoDrafts.length, 1))),
          ),
        ),
      );

      await createCommunityPost({
        uid: userId,
        authorName: displayName,
        authorPhotoDataUrl: profilePhoto,
        caption: caption.trim(),
        progressPhotoDataUrls,
      });

      setCaption("");
      setPhotoDrafts([]);
      setActiveCropPhotoId(null);
      setCropDraft(null);
      setPhotoError(null);
      setSidebarProfile((current) =>
        current
          ? {
              ...current,
              postCount: current.postCount + 1,
              mediaCount: current.mediaCount + (progressPhotoDataUrls.length > 0 ? 1 : 0),
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

  const refreshLikeSummaryForPost = useCallback(async (postId: string) => {
    const summary = await getCommunityLikeSummaryForPost(postId, userId);
    setLikeCountsByPost((current) => ({ ...current, [postId]: summary.count }));
    setLikedPostIds((current) => ({ ...current, [postId]: summary.viewerLiked }));
  }, [userId]);

  const toggleLike = async (post: CommunityPost) => {
    if (!userId) {
      setActionStatus("Log in to like posts.");
      return;
    }
    if (likeBusyPostId) return;

    const postId = post.id;
    const currentlyLiked = Boolean(likedPostIds[postId]);
    const previousCount = likeCountsByPost[postId] ?? 0;
    const optimisticCount = Math.max(0, (likeCountsByPost[postId] ?? 0) + (currentlyLiked ? -1 : 1));

    setLikeBusyPostId(postId);
    setActionStatus(null);
    setLikedPostIds((current) => ({ ...current, [postId]: !currentlyLiked }));
    setLikeCountsByPost((current) => ({ ...current, [postId]: optimisticCount }));

    try {
      if (currentlyLiked) {
        await unlikeCommunityPost(postId, userId);
        setLikesByPost((current) => {
          const likes = current[postId];
          if (!likes) return current;
          return {
            ...current,
            [postId]: likes.filter((like) => like.uid !== userId),
          };
        });
      } else {
        await likeCommunityPost({
          postId,
          uid: userId,
          authorName: displayName || "Arc User",
          authorPhotoDataUrl: profilePhoto || "",
        });
        if (post.uid && post.uid !== userId) {
          try {
            await createUserNotification({
              type: "like",
              recipientUid: post.uid,
              actorUid: userId,
              actorName: displayName || "Arc User",
              actorPhotoDataUrl: profilePhoto || "",
              postId,
              postCaption: post.caption || "",
            });
          } catch (error) {
            console.error("Failed to create like notification", error);
          }
        }
        setLikesByPost((current) => {
          const likes = current[postId];
          if (!likes) return current;
          const next = likes.filter((like) => like.uid !== userId);
          return {
            ...current,
            [postId]: [
              {
                id: `${postId}__${userId}`,
                postId,
                uid: userId,
                authorName: displayName || "Arc User",
                authorPhotoDataUrl: profilePhoto || "",
                createdAt: null,
              },
              ...next,
            ],
          };
        });
      }
      // Refresh server-derived count/state without rolling back successful writes.
      void refreshLikeSummaryForPost(postId);
    } catch {
      setLikedPostIds((current) => ({ ...current, [postId]: currentlyLiked }));
      setLikeCountsByPost((current) => ({ ...current, [postId]: previousCount }));
      setActionStatus("Unable to update like right now.");
    } finally {
      setLikeBusyPostId(null);
    }
  };

  const openLikesOverlay = async (postId: string) => {
    setLikesOverlayPostId(postId);
    if (likesByPost[postId] || likesLoadingByPost[postId]) return;
    setLikesLoadingByPost((current) => ({ ...current, [postId]: true }));
    try {
      const likes = await listCommunityLikesForPost(postId);
      setLikesByPost((current) => ({ ...current, [postId]: likes }));
    } catch {
      setActionStatus("Unable to load likes right now.");
    } finally {
      setLikesLoadingByPost((current) => ({ ...current, [postId]: false }));
    }
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
      const resolvedIdentity = resolveIdentity(
        post.uid,
        post.authorName || "Arc User",
        post.authorPhotoDataUrl || "",
      );
      if (currentlyFollowing) {
        await unfollowUser(userId, post.uid);
      } else {
        await followUser(
          userId,
          {
            uid: post.uid,
            username: resolvedIdentity.name,
            photoDataUrl: resolvedIdentity.photo,
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

        const resolvedIdentity = resolveIdentity(
          post.uid,
          post.authorName || "Arc User",
          post.authorPhotoDataUrl || "",
        );

        return [
          ...current,
          {
            uid: post.uid,
            username: resolvedIdentity.name,
            photoDataUrl: resolvedIdentity.photo,
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
    const nextOpen = !expandedComments[postId];

    setExpandedComments((current) => ({
      ...current,
      [postId]: nextOpen,
    }));

    if (nextOpen) {
      setVisibleCommentsByPost((current) => ({
        ...current,
        [postId]: current[postId] ?? INITIAL_VISIBLE_COMMENTS,
      }));
      void refreshCommentsForPost(postId);
    }
  };

  const submitComment = async (post: CommunityPost, parentComment?: CommunityComment | null) => {
    if (!userId) {
      setActionStatus("Log in to comment on posts.");
      return;
    }
    if (commentSubmitBusyPostId) return;

    const parentCommentId = parentComment?.id ?? null;
    const text = parentCommentId
      ? (replyDraftsByComment[parentCommentId] || "").trim()
      : (commentDrafts[post.id] || "").trim();
    if (!text) return;

    setCommentSubmitBusyPostId(post.id);
    try {
      await createCommunityComment({
        postId: post.id,
        postOwnerUid: post.uid,
        parentCommentId,
        uid: userId,
        authorName: displayName || "Arc User",
        authorPhotoDataUrl: profilePhoto,
        text,
        postCaption: post.caption,
      });

      await refreshCommentsForPost(post.id, true);
      if (parentCommentId) {
        setReplyDraftsByComment((current) => ({
          ...current,
          [parentCommentId]: "",
        }));
        setActiveReplyCommentIdByPost((current) => ({
          ...current,
          [post.id]: null,
        }));
      } else {
        setCommentDrafts((current) => ({
          ...current,
          [post.id]: "",
        }));
      }
      setExpandedComments((current) => ({
        ...current,
        [post.id]: true,
      }));
      setActionStatus(parentCommentId ? "Reply added." : "Comment added.");
    } catch {
      setActionStatus(parentCommentId ? "Unable to add reply right now." : "Unable to add comment right now.");
    } finally {
      setCommentSubmitBusyPostId(null);
    }
  };

  const toggleCommentLike = async (postId: string, comment: CommunityComment) => {
    if (!userId) {
      setActionStatus("Log in to like comments.");
      return;
    }
    if (commentLikeBusyId) return;

    const currentlyLiked = Boolean(likedCommentIds[comment.id]);
    const previousCount = commentLikeCountsByComment[comment.id] ?? 0;
    const optimisticCount = Math.max(0, previousCount + (currentlyLiked ? -1 : 1));

    setCommentLikeBusyId(comment.id);
    setLikedCommentIds((current) => ({ ...current, [comment.id]: !currentlyLiked }));
    setCommentLikeCountsByComment((current) => ({ ...current, [comment.id]: optimisticCount }));
    setActionStatus(null);

    try {
      if (currentlyLiked) {
        await unlikeCommunityComment(comment.id, userId);
      } else {
        await likeCommunityComment({
          postId,
          commentId: comment.id,
          uid: userId,
          authorName: displayName || "Arc User",
          authorPhotoDataUrl: profilePhoto || "",
        });
      }
    } catch {
      setLikedCommentIds((current) => ({ ...current, [comment.id]: currentlyLiked }));
      setCommentLikeCountsByComment((current) => ({ ...current, [comment.id]: previousCount }));
      setActionStatus("Unable to update comment like right now.");
    } finally {
      setCommentLikeBusyId(null);
    }
  };

  const removeComment = async (postId: string, comment: CommunityComment) => {
    if (!userId) {
      setActionStatus("Log in to delete comments.");
      return;
    }
    if (comment.uid !== userId) {
      setActionStatus("You can only delete your own comments.");
      return;
    }
    if (commentDeleteBusyId) return;
    if (!window.confirm("Delete this comment?")) return;

    setCommentDeleteBusyId(comment.id);
    try {
      await deleteCommunityComment(comment.id);
      await refreshCommentsForPost(postId, true);
      setActionStatus("Comment deleted.");
    } catch {
      setActionStatus("Unable to delete comment right now.");
    } finally {
      setCommentDeleteBusyId(null);
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
                current.mediaCount - (getCommunityPostPhotoDataUrls(post).length > 0 ? 1 : 0),
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
          <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="bg-[radial-gradient(circle_at_top_left,rgba(14,116,144,0.16),transparent_46%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.92))] p-4 text-white">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">Your Profile</p>
              <div className="mt-3 flex items-start gap-3">
                {sidebarProfile?.photoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sidebarProfile.photoDataUrl}
                    alt={`${sidebarProfile.username} profile`}
                    className="h-14 w-14 rounded-full border border-white/20 object-cover"
                  />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-900">
                    {getInitials(sidebarProfile?.username || displayName)}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-bold text-white">{sidebarProfile?.username || displayName}</h2>
                  <p className="mt-1 text-xs text-white/70">
                    {sidebarProfile?.workoutSplit || "Set your split in profile"}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4">
              {userId ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
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
                  <p className="text-sm text-slate-600 dark:text-slate-300">
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
            </div>
          </section>

          {showTrainingSidebar ? (
            <section className="mt-4 overflow-hidden rounded-[1.6rem] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(18,26,39,0.98),rgba(25,36,58,0.98))] p-4 text-white shadow-[0_24px_60px_-35px_rgba(15,23,42,0.7)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(22,34,54,0.98))]">
              <h2 className="text-lg font-black text-slate-100">Activity by planned weekday</h2>
              <div className="mt-4 space-y-3">
                {sidebarWeekdayActivity.map((item) => {
                  const width = Math.max(8, Math.round((item.attended / maxSidebarWeekdayAttendance) * 100));
                  return (
                    <div
                      key={item.day}
                      className="grid grid-cols-[minmax(88px,108px)_1fr_22px] items-center gap-2 text-sm"
                    >
                      <span className="inline-flex flex-wrap items-center gap-1 text-slate-300">
                        {item.day}
                        {item.isToday ? (
                          <span className="rounded-full bg-white/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                            Today
                          </span>
                        ) : null}
                      </span>
                      <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#fb923c,#f97316,#38bdf8)] transition-[width] duration-700"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <span className="text-right font-semibold text-slate-200">{item.attended}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </aside>

        <div className="mt-4 lg:col-start-2 lg:mt-0">
          <div className="mx-auto max-w-5xl space-y-4 rounded-[2rem] bg-[radial-gradient(circle_at_15%_0%,rgba(15,23,42,0.22),transparent_42%),radial-gradient(circle_at_86%_8%,rgba(8,47,73,0.16),transparent_36%)] p-1.5 sm:p-2">
            <header className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="bg-[radial-gradient(circle_at_top_left,rgba(8,145,178,0.18),transparent_36%),linear-gradient(135deg,rgba(248,250,252,0.98),rgba(226,232,240,0.88))] px-4 py-5 dark:bg-[radial-gradient(circle_at_top_left,rgba(8,145,178,0.22),transparent_36%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.92))]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
                      Arc Socializing
                    </p>
                    <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                      {heading}
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-2xl border border-white/70 bg-white/80 px-3 py-2 text-right shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        Active circle
                      </p>
                      <p className="text-lg font-black text-slate-900 dark:text-white">{followingUsers.length + 1}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void loadPosts(true);
                      }}
                      disabled={isRefreshing}
                      className="rounded-full border border-slate-300 bg-white/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:bg-white disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {isRefreshing ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/70 bg-white/80 px-3 py-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Arc Heat</p>
                    <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">{posts.length}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Total posts</p>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/80 px-3 py-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">This Week</p>
                    <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">{last7DaysPosts}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Fresh updates</p>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/80 px-3 py-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Photo Mix</p>
                    <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">{photoPostRatio}%</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">With visuals</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-700">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor="home-search"
                      className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300"
                    >
                      Search Users And Posts
                    </label>
                    {actionStatus ? (
                      <p className="text-xs text-slate-600 dark:text-slate-300">{actionStatus}</p>
                    ) : null}
                  </div>
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
                                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                                  {suggestion.name}
                                </span>
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
              </div>
            </header>

            <section className="rounded-[2rem] border border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex gap-4 overflow-x-auto pb-1">
                {storyProfiles.map((profile) => {
                  const initials = getInitials(profile.name);
                  return (
                    <div key={`${profile.uid}:${profile.name}`} className="flex min-w-16 flex-col items-center gap-1 text-center">
                      <div className="rounded-full bg-[linear-gradient(140deg,#0f172a,#111827,#0891b2)] p-[2px]">
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

            <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <form className="space-y-3" onSubmit={onSubmit}>
                <div className="flex items-start gap-3">
                  {profilePhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profilePhoto}
                      alt={`${displayName} profile`}
                      className="h-11 w-11 rounded-full border border-slate-200 object-cover dark:border-slate-700"
                    />
                  ) : (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-white dark:text-slate-900">
                      {getInitials(displayName)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Share a training update</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{composerCharacterCount}/400</p>
                    </div>
                    <textarea
                      value={caption}
                      onChange={(event) => setCaption(event.target.value)}
                      placeholder={userId ? "Share a training update..." : "Log in to post."}
                      className="mt-2 min-h-28 w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none ring-slate-300 focus:ring dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100"
                      maxLength={400}
                      disabled={!userId || isSubmitting}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={onPhotoSelected}
                      disabled={!userId || isSubmitting}
                    />
                    Add Photos
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Up to {MAX_UPLOAD_PHOTOS} photos. Each image is cropped to a 4:5 post frame.
                  </p>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="rounded-full bg-[linear-gradient(135deg,#0f172a,#111827,#0891b2)] px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? "Posting..." : "Post"}
                  </button>
                  {!userId ? <p className="text-xs text-slate-500 dark:text-slate-400">You need an account to post.</p> : null}
                </div>

                {photoError ? <p className="text-xs text-rose-600 dark:text-rose-300">{photoError}</p> : null}

                {photoDrafts.length > 0 ? (
                  <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                    <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Photo preview</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {photoDrafts.length}/{MAX_UPLOAD_PHOTOS} selected
                      </p>
                    </div>
                    <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
                      {photoDrafts.map((draft, index) => (
                        <div
                          key={draft.id}
                          className="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/70"
                        >
                          <div className="aspect-[4/5] bg-slate-100 dark:bg-slate-800">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={draft.previewDataUrl}
                              alt={`Selected upload preview ${index + 1}`}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2 px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                                {draft.fileName}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">Ready to upload</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveCropPhotoId(draft.id);
                                }}
                                className="rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                Crop
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  removePhotoDraft(draft.id);
                                }}
                                className="rounded-full border border-rose-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-600 transition hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
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

            {activeCropPhoto && cropDraft ? (
              <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="flex flex-col gap-4 lg:flex-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                          Crop Editor
                        </p>
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                          Adjust {activeCropPhoto.fileName}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">4:5 portrait frame</p>
                    </div>
                    <div className="mt-3 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-[#111] dark:border-slate-700">
                      <div
                        className={`relative mx-auto aspect-[4/5] max-w-sm overflow-hidden touch-none ${
                          isDraggingCrop ? "cursor-grabbing" : "cursor-grab"
                        }`}
                        onPointerDown={startCropDrag}
                        onPointerMove={moveCropDrag}
                        onPointerUp={endCropDrag}
                        onPointerCancel={endCropDrag}
                      >
                        {activeCropLayout ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={activeCropPhoto.originalDataUrl}
                              alt="Crop editor"
                              draggable={false}
                              className="pointer-events-none absolute select-none object-cover"
                              style={{
                                width: `${activeCropLayout.widthPercent}%`,
                                height: `${activeCropLayout.heightPercent}%`,
                                left: `${activeCropLayout.leftPercent}%`,
                                top: `${activeCropLayout.topPercent}%`,
                                transform: "translate(-50%, -50%)",
                              }}
                            />
                            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/15" />
                            <div className="pointer-events-none absolute inset-0 border-[10px] border-black/30" />
                            <div className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-white/20" />
                            <div className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-white/20" />
                            <div className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-white/20" />
                            <div className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-white/20" />
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="w-full max-w-md space-y-4">
                    <label className="block">
                      <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        <span>Zoom</span>
                        <span>{cropDraft.zoom.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="3"
                        step="0.05"
                        value={cropDraft.zoom}
                        onChange={(event) =>
                          setCropDraft((current) =>
                            current ? { ...current, zoom: Number(event.target.value) } : current,
                          )
                        }
                        className="w-full"
                      />
                    </label>

                    <p className="rounded-2xl bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                      Drag the image to position it inside the frame, then use zoom to fine-tune the crop.
                    </p>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCropDraft({ zoom: 1, offsetX: 0, offsetY: 0 });
                        }}
                        className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveCropPhotoId(null);
                        }}
                        className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void saveCropChanges();
                        }}
                        disabled={isCropSaving}
                        className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                      >
                        {isCropSaving ? "Saving..." : "Save Crop"}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="flex items-center justify-between px-1">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  Feed
                </p>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {normalizedSearch ? "Filtered updates" : "Latest from the community"}
                </h2>
              </div>
              <p className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                {visibleFeedCount} post{visibleFeedCount === 1 ? "" : "s"}
              </p>
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
                  const resolvedIdentity = resolveIdentity(
                    post.uid,
                    post.authorName || "Arc User",
                    post.authorPhotoDataUrl || "",
                  );
                  const postPhotos = getCommunityPostPhotoDataUrls(post);
                  const initials = getInitials(resolvedIdentity.name || "Arc");
                  const isLiked = Boolean(likedPostIds[post.id]);
                  const postLikeCount = likeCountsByPost[post.id] ?? 0;
                  const hasLoadedComments = Object.prototype.hasOwnProperty.call(commentsByPost, post.id);
                  const isCommentsLoading = Boolean(commentsLoadingByPost[post.id]);
                  const postComments = commentsByPost[post.id] || [];
                  const postCommentCount = hasLoadedComments
                    ? postComments.length
                    : (commentCountsByPost[post.id] ?? 0);
                  const postCommentIds = new Set(postComments.map((comment) => comment.id));
                  const rootComments = postComments.filter(
                    (comment) =>
                      !comment.parentCommentId || !postCommentIds.has(comment.parentCommentId),
                  );
                  const repliesByParentId = new Map<string, CommunityComment[]>();
                  for (const comment of postComments) {
                    if (!comment.parentCommentId) continue;
                    const existingReplies = repliesByParentId.get(comment.parentCommentId) || [];
                    existingReplies.push(comment);
                    repliesByParentId.set(comment.parentCommentId, existingReplies);
                  }
                  const visibleComments = Math.max(
                    INITIAL_VISIBLE_COMMENTS,
                    visibleCommentsByPost[post.id] ?? INITIAL_VISIBLE_COMMENTS,
                  );
                  const visibleRootComments = rootComments.slice(-visibleComments);
                  const hasMoreHiddenComments = rootComments.length > visibleRootComments.length;
                  const isCommentsOpen = Boolean(expandedComments[post.id]);
                  const isPostOwner = userId === post.uid;
                  const showCommentsPanel = isCommentsOpen;
                  const activePhotoIndex = Math.min(
                    activePhotoIndexByPost[post.id] ?? 0,
                    Math.max(postPhotos.length - 1, 0),
                  );
                  const accentClass =
                    index % 3 === 0
                      ? "from-slate-900/30 to-slate-900/0"
                      : index % 3 === 1
                        ? "from-slate-700/30 to-slate-700/0"
                        : "from-cyan-900/30 to-cyan-900/0";

                  const postHeader = (
                    <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                      <div className="flex min-w-0 items-center gap-3.5">
                        <Link href={`/users/${post.uid}`} className="shrink-0" aria-label="Open user profile">
                          {resolvedIdentity.photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={resolvedIdentity.photo}
                              alt={`${resolvedIdentity.name || "User"} avatar`}
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
                            {resolvedIdentity.name || "Arc User"}
                          </Link>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {formatTimestamp(post.createdAt)}
                            </p>
                            {postPhotos.length > 0 ? (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {postPhotos.length === 1 ? "Photo update" : `${postPhotos.length} photos`}
                              </span>
                            ) : null}
                          </div>
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
                  );

                  const postActions = (
                    <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-200">
                      <button
                        type="button"
                        onClick={() => {
                          void toggleLike(post);
                        }}
                        disabled={likeBusyPostId === post.id}
                        className={`flex h-9 w-9 items-center justify-center rounded-full border text-lg transition ${
                          isLiked
                            ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                            : "border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                        aria-label={isLiked ? "Unlike post" : "Like post"}
                        title={isLiked ? "Unlike" : "Like"}
                      >
                        {"🔥"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void openLikesOverlay(post.id);
                        }}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        aria-label="View likes"
                        title="View likes"
                      >
                        {postLikeCount} like{postLikeCount === 1 ? "" : "s"}
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
                  );

                  const commentsPanel = (
                    <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                      {isCommentsLoading ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">Loading comments...</p>
                      ) : !hasLoadedComments || postComments.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">No comments yet.</p>
                      ) : (
                        <ul className="space-y-1">
                          {visibleRootComments.map((comment) => {
                            const replies = repliesByParentId.get(comment.id) || [];
                            const isReplyComposerOpen = activeReplyCommentIdByPost[post.id] === comment.id;
                            const commentLikeCount = commentLikeCountsByComment[comment.id] ?? 0;
                            const commentLikedByViewer = Boolean(likedCommentIds[comment.id]);
                            return (
                              <li key={comment.id} className="rounded-xl bg-white px-2 py-1.5 text-xs text-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
                                <div className="flex items-start gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p>
                                      <span className="font-semibold">{comment.authorName || "Arc User"}</span> {comment.text}
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                      <span>{formatCommentTimestamp(comment.createdAt)}</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          void toggleCommentLike(post.id, comment);
                                        }}
                                        disabled={commentLikeBusyId === comment.id}
                                        className={`rounded-full border px-2 py-0.5 font-semibold transition ${
                                          commentLikedByViewer
                                            ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                            : "border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                        } disabled:cursor-not-allowed disabled:opacity-60`}
                                      >
                                        Like {commentLikeCount > 0 ? `(${commentLikeCount})` : ""}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setActiveReplyCommentIdByPost((current) => ({
                                            ...current,
                                            [post.id]: current[post.id] === comment.id ? null : comment.id,
                                          }))
                                        }
                                        className="rounded-full border border-slate-200 px-2 py-0.5 font-semibold text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                      >
                                        Reply
                                      </button>
                                    </div>
                                  </div>
                                  {userId === comment.uid ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void removeComment(post.id, comment);
                                      }}
                                      disabled={commentDeleteBusyId === comment.id}
                                      className="shrink-0 rounded-full p-1 text-[10px] font-semibold leading-none text-slate-400 transition hover:bg-slate-100 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-rose-300"
                                      aria-label="Delete comment"
                                      title="Delete comment"
                                    >
                                      {commentDeleteBusyId === comment.id ? "…" : "×"}
                                    </button>
                                  ) : null}
                                </div>

                                {isReplyComposerOpen ? (
                                  <form
                                    className="mt-2 flex gap-2"
                                    onSubmit={(event) => {
                                      event.preventDefault();
                                      submitComment(post, comment);
                                    }}
                                  >
                                    <input
                                      type="text"
                                      value={replyDraftsByComment[comment.id] || ""}
                                      onChange={(event) =>
                                        setReplyDraftsByComment((current) => ({
                                          ...current,
                                          [comment.id]: event.target.value,
                                        }))
                                      }
                                      placeholder={userId ? "Write a reply..." : "Log in to reply."}
                                      disabled={!userId}
                                      className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none ring-slate-300 focus:ring dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                    />
                                    <button
                                      type="submit"
                                      disabled={!userId || !(replyDraftsByComment[comment.id] || "").trim() || commentSubmitBusyPostId === post.id}
                                      className="inline-flex min-w-[76px] items-center justify-center rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                                    >
                                      Reply
                                    </button>
                                  </form>
                                ) : null}

                                {replies.length > 0 ? (
                                  <ul className="mt-2 space-y-1 border-l border-slate-200 pl-3 dark:border-slate-700">
                                    {replies.map((reply) => {
                                      const replyLikeCount = commentLikeCountsByComment[reply.id] ?? 0;
                                      const replyLikedByViewer = Boolean(likedCommentIds[reply.id]);
                                      return (
                                        <li key={reply.id} className="rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                                          <div className="flex items-start gap-2">
                                            <div className="min-w-0 flex-1">
                                              <p>
                                                <span className="font-semibold">{reply.authorName || "Arc User"}</span> {reply.text}
                                              </p>
                                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                                <span>{formatCommentTimestamp(reply.createdAt)}</span>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    void toggleCommentLike(post.id, reply);
                                                  }}
                                                  disabled={commentLikeBusyId === reply.id}
                                                  className={`rounded-full border px-2 py-0.5 font-semibold transition ${
                                                    replyLikedByViewer
                                                      ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                      : "border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                                  } disabled:cursor-not-allowed disabled:opacity-60`}
                                                >
                                                  Like {replyLikeCount > 0 ? `(${replyLikeCount})` : ""}
                                                </button>
                                              </div>
                                            </div>
                                            {userId === reply.uid ? (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  void removeComment(post.id, reply);
                                                }}
                                                disabled={commentDeleteBusyId === reply.id}
                                                className="shrink-0 rounded-full p-1 text-[10px] font-semibold leading-none text-slate-400 transition hover:bg-slate-100 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-rose-300"
                                                aria-label="Delete comment"
                                                title="Delete comment"
                                              >
                                                {commentDeleteBusyId === reply.id ? "…" : "×"}
                                              </button>
                                            ) : null}
                                          </div>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {!isCommentsLoading && hasMoreHiddenComments ? (
                        <button
                          type="button"
                          onClick={() =>
                            setVisibleCommentsByPost((current) => ({
                              ...current,
                              [post.id]: Math.min(
                                rootComments.length,
                                (current[post.id] ?? INITIAL_VISIBLE_COMMENTS) + COMMENTS_PAGE_STEP,
                              ),
                            }))
                          }
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Load older comments
                        </button>
                      ) : null}

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
                          disabled={!userId || !(commentDrafts[post.id] || "").trim() || commentSubmitBusyPostId === post.id}
                          className="inline-flex min-w-[88px] items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                        >
                          {commentSubmitBusyPostId === post.id ? (
                            <>
                              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/70 border-t-transparent dark:border-slate-700/70 dark:border-t-transparent" />
                              Posting...
                            </>
                          ) : (
                            "Comment"
                          )}
                        </button>
                      </form>
                    </div>
                  );

                  return (
                    <li
                      key={post.id}
                      id={`post-${post.id}`}
                      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
                    >
                      <div className={`h-1.5 w-full bg-gradient-to-r ${accentClass}`} />
                      {postPhotos.length > 0 ? (
                        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px]">
                          <div className="border-b border-slate-200 bg-black lg:border-b-0 lg:border-r dark:border-slate-700">
                            <div className="relative">
                              <div className="overflow-hidden">
                                <div
                                  className="flex transition-transform duration-300 ease-out"
                                  style={{ transform: `translateX(-${activePhotoIndex * 100}%)` }}
                                >
                                  {postPhotos.map((photo, photoIndex) => (
                                    <div key={`${post.id}:photo:${photoIndex}`} className="w-full shrink-0">
                                      <div className="aspect-[4/5] bg-black">
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
                              </div>
                              {postPhotos.length > 1 ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setActivePhotoIndexByPost((current) => ({
                                        ...current,
                                        [post.id]: Math.max(0, activePhotoIndex - 1),
                                      }))
                                    }
                                    disabled={activePhotoIndex === 0}
                                    className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-lg text-slate-900 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label="Previous photo"
                                  >
                                    ‹
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setActivePhotoIndexByPost((current) => ({
                                        ...current,
                                        [post.id]: Math.min(postPhotos.length - 1, activePhotoIndex + 1),
                                      }))
                                    }
                                    disabled={activePhotoIndex >= postPhotos.length - 1}
                                    className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-lg text-slate-900 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label="Next photo"
                                  >
                                    ›
                                  </button>
                                  <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/30 px-2 py-1 backdrop-blur">
                                    {postPhotos.map((_, photoIndex) => (
                                      <button
                                        key={`${post.id}:dot:${photoIndex}`}
                                        type="button"
                                        onClick={() =>
                                          setActivePhotoIndexByPost((current) => ({
                                            ...current,
                                            [post.id]: photoIndex,
                                          }))
                                        }
                                        className={`h-1.5 w-1.5 rounded-full transition ${
                                          photoIndex === activePhotoIndex ? "bg-white" : "bg-white/45"
                                        }`}
                                        aria-label={`View photo ${photoIndex + 1}`}
                                      />
                                    ))}
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex min-h-full flex-col bg-white dark:bg-slate-900">
                            {postHeader}
                            <div className="space-y-3 border-t border-slate-200 px-4 py-3 dark:border-slate-700 lg:border-t-0">
                              {postActions}
                              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">
                                <span className="mr-1 font-semibold">{resolvedIdentity.name || "Arc User"}</span>
                                {post.caption}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {isLiked ? "You liked this post" : "Tap fire to like"} · {postLikeCount} likes · {postCommentCount} comments
                              </p>
                            </div>
                            {showCommentsPanel ? <div className="flex-1 px-4 pb-4">{commentsPanel}</div> : null}
                          </div>
                        </div>
                      ) : (
                        <>
                          {postHeader}
                          <div className="space-y-2 px-4 py-3">
                            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">
                              <span className="mr-1 font-semibold">{resolvedIdentity.name || "Arc User"}</span>
                              {post.caption}
                            </p>
                            {postActions}
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {isLiked ? "You liked this post" : "Tap fire to like"} · {postLikeCount} likes · {postCommentCount} comments
                            </p>
                            {showCommentsPanel ? commentsPanel : null}
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <aside className="mt-4 space-y-4 lg:sticky lg:top-24 lg:mt-0">
          <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="bg-[linear-gradient(135deg,rgba(8,145,178,0.14),rgba(15,23,42,0.08))] px-4 py-4 dark:bg-[linear-gradient(135deg,rgba(8,145,178,0.2),rgba(15,23,42,0.28))]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
                Your Circle
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
                {followingUsers.length > 0 ? "People you follow" : "Build your feed"}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {followingUsers.length > 0
                  ? "Keep tabs on the lifters and friends you already follow."
                  : "Follow a few Arc users to make this page feel more alive."}
              </p>
            </div>
            <div className="space-y-2 p-4">
              {followingUsers.slice(0, 5).map((user) => {
                const resolvedIdentity = resolveIdentity(
                  user.uid,
                  user.username || "Arc User",
                  user.photoDataUrl || "",
                );
                const avatarKey = `following:${user.uid}`;

                return (
                  <Link
                    key={avatarKey}
                    href={`/users/${user.uid}`}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 px-3 py-2 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60"
                  >
                    {resolvedIdentity.photo && !brokenAvatarKeys[avatarKey] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolvedIdentity.photo}
                        alt={`${resolvedIdentity.name} avatar`}
                        className="h-10 w-10 rounded-full border border-slate-200 object-cover dark:border-slate-700"
                        onError={() =>
                          setBrokenAvatarKeys((current) => ({ ...current, [avatarKey]: true }))
                        }
                      />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">
                        {getInitials(resolvedIdentity.name || "Arc User")}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {resolvedIdentity.name || "Arc User"}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">View profile</p>
                    </div>
                  </Link>
                );
              })}
              {followingUsers.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  You are not following anyone yet.
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
              Discover
            </p>
            <div className="mt-3 space-y-2">
              {discoverProfiles.map((profile) => (
                <Link
                  key={`discover:${profile.uid}`}
                  href={`/users/${profile.uid}`}
                  className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2 transition hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800"
                >
                  {profile.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.photo}
                      alt={`${profile.name} avatar`}
                      className="h-10 w-10 rounded-full border border-slate-200 object-cover dark:border-slate-700"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">
                      {getInitials(profile.name)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{profile.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Suggested profile</p>
                  </div>
                </Link>
              ))}
              {discoverProfiles.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  No new profile suggestions right now.
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
              Quick Notes
            </p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <li className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                Post progress photos to make your updates easier to scan.
              </li>
              <li className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                Search supports usernames, post captions, and direct post IDs.
              </li>
              <li className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                Share a post to copy a direct link back to the feed.
              </li>
            </ul>
          </section>
        </aside>
      </div>

      {likesOverlayPostId ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <button
            type="button"
            onClick={() => setLikesOverlayPostId(null)}
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
            aria-label="Close likes overlay"
          />
          <div className="relative z-[121] w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.35)] dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  Likes
                </p>
                <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
                  {overlayLikeCount} like{overlayLikeCount === 1 ? "" : "s"}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {overlayPost ? `Post by ${overlayPost.authorName || "Arc User"}` : "Post likes"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLikesOverlayPostId(null)}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            {overlayLikesLoading ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading likes...</p>
            ) : overlayLikes.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                No likes yet.
              </p>
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {overlayLikes.map((like) => (
                  <li key={like.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
                    {like.authorPhotoDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={like.authorPhotoDataUrl}
                        alt={`${like.authorName || "Arc User"} avatar`}
                        className="h-9 w-9 rounded-full border border-slate-200 object-cover dark:border-slate-700"
                      />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">
                        {getInitials(like.authorName || "Arc User")}
                      </span>
                    )}
                    <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {like.authorName || "Arc User"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
