"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

type AdminUserSummary = {
  uid: string;
  email: string;
  username: string;
  accountStatus: "active" | "suspended";
};

type CommunityPostSummary = {
  id: string;
  uid: string;
  authorName: string;
  caption: string;
  createdAt: string | null;
  commentCount: number;
  likeCount: number;
};

type DeleteTarget =
  | { kind: "user"; id: string; label: string }
  | { kind: "post"; id: string; label: string };

const clipText = (value: string, max = 80): string => {
  const cleaned = value.trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
};

export default function AdminDashboardClient({
  actorUid,
  actorEmail,
  actorRole,
}: {
  actorUid: string;
  actorEmail: string;
  actorRole: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [posts, setPosts] = useState<CommunityPostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionVerified, setSessionVerified] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [reason, setReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const expectedConfirmation = useMemo(() => {
    if (!deleteTarget) return "";
    return `DELETE ${deleteTarget.id}`;
  }, [deleteTarget]);

  const loadData = useCallback(async () => {
    if (!sessionVerified) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const [usersResponse, postsResponse] = await Promise.all([
        fetch("/api/admin/v1/users?limit=80", { cache: "no-store" }),
        fetch("/api/admin/v1/community/posts?limit=80", { cache: "no-store" }),
      ]);
      const usersJson = (await usersResponse.json()) as { data: AdminUserSummary[] | null; error?: string };
      const postsJson = (await postsResponse.json()) as { data: CommunityPostSummary[] | null; error?: string };

      if (!usersResponse.ok) {
        throw new Error(usersJson.error || "Failed to load users.");
      }
      if (!postsResponse.ok) {
        throw new Error(postsJson.error || "Failed to load posts.");
      }

      setUsers(Array.isArray(usersJson.data) ? usersJson.data : []);
      setPosts(Array.isArray(postsJson.data) ? postsJson.data : []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load admin data.");
    } finally {
      setLoading(false);
    }
  }, [sessionVerified]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        await fetch("/api/admin/v1/session", { method: "DELETE" }).catch(() => undefined);
        router.replace("/admin-login?next=/admin-console");
        return;
      }

      try {
        const idToken = await user.getIdToken();
        const response = await fetch("/api/admin/v1/session", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Admin access denied.");
        }
        setSessionVerified(true);
      } catch {
        await fetch("/api/admin/v1/session", { method: "DELETE" }).catch(() => undefined);
        router.replace("/admin-login?next=/admin-console");
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!sessionVerified) return;
    void loadData();
  }, [loadData, sessionVerified]);

  const openDeleteDialog = (target: DeleteTarget) => {
    setDeleteTarget(target);
    setConfirmInput("");
    setReason("");
    setErrorMessage("");
  };

  const closeDeleteDialog = () => {
    if (actionLoading) return;
    setDeleteTarget(null);
    setConfirmInput("");
    setReason("");
  };

  const runDelete = async (event: FormEvent) => {
    event.preventDefault();
    if (!deleteTarget) return;
    if (confirmInput.trim() !== expectedConfirmation) {
      setErrorMessage(`Type "${expectedConfirmation}" to confirm.`);
      return;
    }
    if (deleteTarget.kind === "user" && !reason.trim()) {
      setErrorMessage("Reason is required for account deletion.");
      return;
    }

    setActionLoading(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      if (deleteTarget.kind === "user") {
        const response = await fetch(`/api/admin/v1/users/${encodeURIComponent(deleteTarget.id)}/delete`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Unable to delete account.");
        }
        setStatusMessage(`Deleted account ${deleteTarget.id}.`);
      } else {
        const response = await fetch(`/api/admin/v1/community/posts/${encodeURIComponent(deleteTarget.id)}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Unable to delete post.");
        }
        setStatusMessage(`Deleted post ${deleteTarget.id}.`);
      }

      closeDeleteDialog();
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Delete action failed.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">Session</p>
        <p className="mt-2 text-sm text-zinc-700">
          Actor: <span className="font-medium">{actorEmail || actorUid || "unknown"}</span> ({actorRole || "unknown role"})
        </p>
      </section>

      {!sessionVerified ? (
        <section className="rounded-xl border border-sky-300 bg-sky-50 p-4 text-sm text-sky-900">
          Verifying admin email access...
        </section>
      ) : null}

      {statusMessage ? (
        <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          {statusMessage}
        </section>
      ) : null}

      {errorMessage ? (
        <section className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">{errorMessage}</section>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-900">Users</h2>
          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-semibold text-zinc-700"
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-[0.12em] text-zinc-500">
                <th className="pb-2 pr-3">UID</th>
                <th className="pb-2 pr-3">Email</th>
                <th className="pb-2 pr-3">Username</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.uid} className="border-b border-zinc-100">
                  <td className="py-2 pr-3 font-mono text-xs text-zinc-700">{clipText(user.uid, 24)}</td>
                  <td className="py-2 pr-3 text-zinc-700">{clipText(user.email || "-", 28)}</td>
                  <td className="py-2 pr-3 text-zinc-700">{clipText(user.username || "-", 24)}</td>
                  <td className="py-2 pr-3">
                    <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">{user.accountStatus}</span>
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => openDeleteDialog({ kind: "user", id: user.uid, label: user.email || user.uid })}
                      className="rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-500"
                    >
                      Delete Account
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && users.length === 0 ? (
                <tr>
                  <td className="py-4 text-sm text-zinc-500" colSpan={5}>
                    No users found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Community Posts</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-[0.12em] text-zinc-500">
                <th className="pb-2 pr-3">Post ID</th>
                <th className="pb-2 pr-3">Author</th>
                <th className="pb-2 pr-3">Caption</th>
                <th className="pb-2 pr-3">Comments</th>
                <th className="pb-2 pr-3">Likes</th>
                <th className="pb-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id} className="border-b border-zinc-100">
                  <td className="py-2 pr-3 font-mono text-xs text-zinc-700">{clipText(post.id, 24)}</td>
                  <td className="py-2 pr-3 text-zinc-700">{clipText(post.authorName || post.uid, 20)}</td>
                  <td className="py-2 pr-3 text-zinc-700">{clipText(post.caption || "-", 36)}</td>
                  <td className="py-2 pr-3 text-zinc-700">{post.commentCount}</td>
                  <td className="py-2 pr-3 text-zinc-700">{post.likeCount}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => openDeleteDialog({ kind: "post", id: post.id, label: post.authorName || post.uid })}
                      className="rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-500"
                    >
                      Delete Post
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && posts.length === 0 ? (
                <tr>
                  <td className="py-4 text-sm text-zinc-500" colSpan={6}>
                    No posts found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-zinc-900">
              Confirm {deleteTarget.kind === "user" ? "Account Deletion" : "Post Deletion"}
            </h3>
            <p className="mt-2 text-sm text-zinc-600">
              This action is permanent. Target: <span className="font-mono text-xs">{deleteTarget.id}</span> (
              {deleteTarget.label})
            </p>
            <form className="mt-5 space-y-4" onSubmit={runDelete}>
              <label className="block text-sm text-zinc-700">
                Type <span className="font-mono">{expectedConfirmation}</span> to confirm.
                <input
                  value={confirmInput}
                  onChange={(event) => setConfirmInput(event.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  placeholder={expectedConfirmation}
                />
              </label>
              <label className="block text-sm text-zinc-700">
                Reason {deleteTarget.kind === "user" ? "(required)" : "(optional)"}.
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="mt-1 min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  placeholder="Describe why this content/account is being deleted."
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeDeleteDialog}
                  className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700"
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-70"
                  disabled={actionLoading}
                >
                  {actionLoading ? "Deleting..." : "Confirm Delete"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
