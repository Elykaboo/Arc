import { getAdminDb } from "@/lib/firebase-admin";
import type { CommunityPost } from "@/lib/community-db";
import type { FollowGraphUser } from "@/lib/follow-db";
import type { MemberProfile } from "@/lib/member-db";
import type { SearchableUserProfile } from "@/lib/profile-db";
import type { PublicUserProfile } from "@/lib/public-profile-db";

export type CommunityDirectoryInitialData = {
  memberProfiles: MemberProfile[];
  publicProfiles: PublicUserProfile[];
  searchableProfiles: SearchableUserProfile[];
  communityPosts: CommunityPost[];
  followGraphUsers: FollowGraphUser[];
};

const trimString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const loadCommunityDirectoryInitialData = async (): Promise<CommunityDirectoryInitialData> => {
  const db = await getAdminDb();

  const [
    membersSnapshot,
    publicProfilesSnapshot,
    searchableProfilesSnapshot,
    communityPostsSnapshot,
    followingSnapshot,
    followersSnapshot,
  ] = await Promise.all([
    db.collection("members").limit(4000).get(),
    db.collection("publicProfiles").limit(2000).get(),
    db.collectionGroup("profile").limit(2000).get(),
    db.collection("communityPosts").orderBy("createdAt", "desc").limit(200).get(),
    db.collectionGroup("following").limit(4000).get(),
    db.collectionGroup("followers").limit(4000).get(),
  ]);

  const memberProfiles: MemberProfile[] = membersSnapshot.docs
    .map((document) => {
      const data = document.data();
      const username = trimString(data.username);
      if (!document.id || !username) return null;
      return {
        uid: document.id,
        username,
        bio: trimString(data.bio),
        workoutSplit: trimString(data.workoutSplit),
        photoDataUrl: trimString(data.photoDataUrl || data.photoURL),
      };
    })
    .filter((profile): profile is MemberProfile => Boolean(profile));

  const publicProfiles: PublicUserProfile[] = publicProfilesSnapshot.docs
    .map((document) => {
      const data = document.data();
      const username = trimString(data.username);
      if (!document.id || !username) return null;
      return {
        uid: document.id,
        username,
        bio: trimString(data.bio),
        workoutSplit: trimString(data.workoutSplit),
        photoDataUrl: trimString(data.photoDataUrl || data.photoURL),
      };
    })
    .filter((profile): profile is PublicUserProfile => Boolean(profile));

  const searchableProfiles: SearchableUserProfile[] = searchableProfilesSnapshot.docs
    .map((document) => {
      const data = document.data();
      const username = trimString(data.username);
      if (document.id !== "details" || !username) return null;
      const uid = document.ref.parent.parent?.id || "";
      if (!uid) return null;
      return {
        uid,
        username,
        bio: trimString(data.bio),
        workoutSplit: trimString(data.workoutSplit),
        photoDataUrl: trimString(data.photoDataUrl || data.photoURL),
      };
    })
    .filter((profile): profile is SearchableUserProfile => Boolean(profile));

  const communityPosts: CommunityPost[] = communityPostsSnapshot.docs.map((document) => {
    const data = document.data();
    const progressPhotoDataUrl = trimString(data.progressPhotoDataUrl);
    const progressPhotoDataUrls = Array.isArray(data.progressPhotoDataUrls)
      ? data.progressPhotoDataUrls.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean)
      : progressPhotoDataUrl
        ? [progressPhotoDataUrl]
        : [];

    return {
      id: document.id,
      uid: trimString(data.uid),
      authorName: trimString(data.authorName),
      authorPhotoDataUrl: trimString(data.authorPhotoDataUrl),
      caption: trimString(data.caption),
      progressPhotoDataUrl,
      progressPhotoDataUrls,
      createdAt: null,
    };
  });

  const followGraphUsersById = new Map<string, FollowGraphUser>();

  for (const document of followingSnapshot.docs) {
    const data = document.data();
    const targetUid = document.id;
    const sourceUid = document.ref.parent.parent?.id || "";

    if (targetUid) {
      followGraphUsersById.set(targetUid, {
        uid: targetUid,
        username: trimString(data.username),
        photoDataUrl: trimString(data.photoDataUrl),
      });
    }

    if (sourceUid && !followGraphUsersById.has(sourceUid)) {
      followGraphUsersById.set(sourceUid, {
        uid: sourceUid,
        username: "",
        photoDataUrl: "",
      });
    }
  }

  for (const document of followersSnapshot.docs) {
    const data = document.data();
    const viewerUid = document.id;
    const targetUid = document.ref.parent.parent?.id || "";

    if (viewerUid) {
      const existingViewer = followGraphUsersById.get(viewerUid);
      followGraphUsersById.set(viewerUid, {
        uid: viewerUid,
        username: existingViewer?.username || trimString(data.username),
        photoDataUrl: existingViewer?.photoDataUrl || trimString(data.photoDataUrl),
      });
    }

    if (targetUid && !followGraphUsersById.has(targetUid)) {
      followGraphUsersById.set(targetUid, {
        uid: targetUid,
        username: "",
        photoDataUrl: "",
      });
    }
  }

  return {
    memberProfiles,
    publicProfiles,
    searchableProfiles,
    communityPosts,
    followGraphUsers: Array.from(followGraphUsersById.values()),
  };
};
