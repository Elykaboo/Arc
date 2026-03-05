"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  type FirestoreDataConverter,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export type NotificationType = "follow" | "comment" | "like";

export type UserNotification = {
  id: string;
  type: NotificationType;
  recipientUid: string;
  actorUid: string;
  actorName: string;
  actorPhotoDataUrl: string;
  postId: string;
  postCaption: string;
  commentText: string;
  createdAtMs: number | null;
};

type UserNotificationDocument = {
  type: NotificationType;
  recipientUid: string;
  actorUid: string;
  actorName: string;
  actorPhotoDataUrl: string;
  postId: string;
  postCaption: string;
  commentText: string;
  createdAt?: Timestamp;
};

const notificationConverter: FirestoreDataConverter<UserNotificationDocument> = {
  toFirestore(value: UserNotificationDocument) {
    return value;
  },
  fromFirestore(snapshot) {
    const data = snapshot.data();
    const type: NotificationType =
      data.type === "comment" || data.type === "like" || data.type === "follow"
        ? data.type
        : "follow";
    return {
      type,
      recipientUid: typeof data.recipientUid === "string" ? data.recipientUid : "",
      actorUid: typeof data.actorUid === "string" ? data.actorUid : "",
      actorName: typeof data.actorName === "string" ? data.actorName : "",
      actorPhotoDataUrl: typeof data.actorPhotoDataUrl === "string" ? data.actorPhotoDataUrl : "",
      postId: typeof data.postId === "string" ? data.postId : "",
      postCaption: typeof data.postCaption === "string" ? data.postCaption : "",
      commentText: typeof data.commentText === "string" ? data.commentText : "",
      createdAt: data.createdAt,
    };
  },
};

const notificationsCollection = (uid: string) =>
  collection(db, "users", uid, "notifications").withConverter(notificationConverter);

const mapNotification = (
  id: string,
  data: UserNotificationDocument,
): UserNotification => ({
  id,
  type: data.type,
  recipientUid: data.recipientUid,
  actorUid: data.actorUid,
  actorName: data.actorName,
  actorPhotoDataUrl: data.actorPhotoDataUrl,
  postId: data.postId,
  postCaption: data.postCaption,
  commentText: data.commentText,
  createdAtMs: data.createdAt?.toMillis?.() ?? null,
});

const sortNotificationsByNewest = (items: UserNotification[]): UserNotification[] =>
  [...items].sort((left, right) => {
    const leftTime = left.createdAtMs ?? 0;
    const rightTime = right.createdAtMs ?? 0;
    return rightTime - leftTime;
  });

export const createUserNotification = async (input: {
  type: NotificationType;
  recipientUid: string;
  actorUid: string;
  actorName: string;
  actorPhotoDataUrl: string;
  postId?: string;
  postCaption?: string;
  commentText?: string;
}): Promise<void> => {
  await addDoc(notificationsCollection(input.recipientUid), {
    type: input.type,
    recipientUid: input.recipientUid,
    actorUid: input.actorUid,
    actorName: input.actorName.trim(),
    actorPhotoDataUrl: input.actorPhotoDataUrl.trim(),
    postId: input.postId?.trim() || "",
    postCaption: input.postCaption?.trim() || "",
    commentText: input.commentText?.trim() || "",
    createdAt: serverTimestamp(),
  });
};

export const listUserNotifications = async (
  uid: string,
  maxItems = 50,
): Promise<UserNotification[]> => {
  const snapshot = await getDocs(query(notificationsCollection(uid), limit(maxItems)));
  return sortNotificationsByNewest(
    snapshot.docs.map((document) => mapNotification(document.id, document.data())),
  );
};

export const subscribeUserNotifications = (
  uid: string,
  onData: (notifications: UserNotification[]) => void,
  onError?: (error: Error) => void,
  maxItems = 50,
): Unsubscribe => {
  const notificationsQuery = query(notificationsCollection(uid), limit(maxItems));

  return onSnapshot(
    notificationsQuery,
    (snapshot) => {
      onData(
        sortNotificationsByNewest(
          snapshot.docs.map((document) => mapNotification(document.id, document.data())),
        ),
      );
    },
    (error) => {
      onError?.(error);
    },
  );
};

export const deleteUserNotification = async (
  uid: string,
  notificationId: string,
): Promise<void> => {
  await deleteDoc(doc(db, "users", uid, "notifications", notificationId));
};

export const clearUserNotifications = async (uid: string): Promise<void> => {
  const snapshot = await getDocs(query(notificationsCollection(uid), limit(100)));
  await Promise.all(snapshot.docs.map((document) => deleteDoc(document.ref)));
};
