"use client";

import { onAuthStateChanged } from "firebase/auth";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import styles from "./moderation-dashboard.module.css";

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
  commentCount: number;
  likeCount: number;
};

type DeleteTarget =
  | { kind: "user"; id: string; label: string }
  | { kind: "post"; id: string; label: string };

const clipText = (value: string, max = 64): string => {
  const cleaned = value.trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}...`;
};

export default function ModerationDashboard() {
  const [sessionVerified, setSessionVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [posts, setPosts] = useState<CommunityPostSummary[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [reason, setReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const expectedConfirmation = useMemo(() => {
    if (!deleteTarget) return "";
    return `DELETE ${deleteTarget.id}`;
  }, [deleteTarget]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setSessionVerified(false);
        setErrorMessage("Sign in with your Firebase admin account first.");
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
          throw new Error(payload.error || "Admin session denied.");
        }
        setErrorMessage("");
        setSessionVerified(true);
      } catch (error) {
        setSessionVerified(false);
        setErrorMessage(error instanceof Error ? error.message : "Admin session denied.");
      }
    });

    return () => unsubscribe();
  }, []);

  const loadData = useCallback(async () => {
    if (!sessionVerified) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const [usersResponse, postsResponse] = await Promise.all([
        fetch("/api/admin/v1/users?limit=60", { cache: "no-store" }),
        fetch("/api/admin/v1/community/posts?limit=60", { cache: "no-store" }),
      ]);
      const usersPayload = (await usersResponse.json()) as { data: AdminUserSummary[] | null; error?: string };
      const postsPayload = (await postsResponse.json()) as { data: CommunityPostSummary[] | null; error?: string };

      if (!usersResponse.ok) throw new Error(usersPayload.error || "Failed to load users.");
      if (!postsResponse.ok) throw new Error(postsPayload.error || "Failed to load posts.");

      setUsers(Array.isArray(usersPayload.data) ? usersPayload.data : []);
      setPosts(Array.isArray(postsPayload.data) ? postsPayload.data : []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load moderation data.");
    } finally {
      setLoading(false);
    }
  }, [sessionVerified]);

  useEffect(() => {
    if (!sessionVerified) return;
    void loadData();
  }, [loadData, sessionVerified]);

  const openDeleteDialog = (target: DeleteTarget) => {
    setDeleteTarget(target);
    setConfirmInput("");
    setReason("");
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
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/admin" className={styles.backLink}>
          Back to Main Dashboard
        </a>
        <button
          type="button"
          onClick={() => void loadData()}
          className={styles.refreshButton}
          disabled={loading || !sessionVerified}
        >
          {loading ? "Refreshing..." : "Refresh Data"}
        </button>
      </header>

      <section className={styles.hero}>
        <h1 className={styles.title}>Moderation Dashboard</h1>
        <p className={styles.subtitle}>Manage destructive moderation actions for users and posts.</p>
        <div className={styles.stats}>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Users</p>
            <p className={styles.statValue}>{users.length}</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Posts</p>
            <p className={styles.statValue}>{posts.length}</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Session</p>
            <p className={styles.statValue}>{sessionVerified ? "Verified" : "Pending"}</p>
          </div>
        </div>
      </section>

      {!sessionVerified ? <section className={`${styles.banner} ${styles.bannerInfo}`}>Verifying Firebase admin session...</section> : null}
      {statusMessage ? <section className={`${styles.banner} ${styles.bannerSuccess}`}>{statusMessage}</section> : null}
      {errorMessage ? <section className={`${styles.banner} ${styles.bannerError}`}>{errorMessage}</section> : null}

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Users</h2>
          <span className={styles.badge}>{users.length} total</span>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>UID</th>
                <th>Email</th>
                <th>Username</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.uid}>
                  <td className={styles.mono}>{clipText(user.uid, 18)}</td>
                  <td>{clipText(user.email || "-", 28)}</td>
                  <td>{clipText(user.username || "-", 20)}</td>
                  <td>
                    <span className={user.accountStatus === "suspended" ? styles.statusSuspended : styles.statusActive}>
                      {user.accountStatus}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => openDeleteDialog({ kind: "user", id: user.uid, label: user.email || user.uid })}
                      disabled={actionLoading}
                      className={styles.deleteButton}
                    >
                      Delete Account
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && users.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.emptyState}>
                    No users found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Community Posts</h2>
          <span className={styles.badge}>{posts.length} total</span>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Post ID</th>
                <th>Author</th>
                <th>Caption</th>
                <th>Comments</th>
                <th>Likes</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id}>
                  <td className={styles.mono}>{clipText(post.id, 18)}</td>
                  <td>{clipText(post.authorName || post.uid, 18)}</td>
                  <td>{clipText(post.caption || "-", 44)}</td>
                  <td>{post.commentCount}</td>
                  <td>{post.likeCount}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => openDeleteDialog({ kind: "post", id: post.id, label: post.authorName || post.uid })}
                      disabled={actionLoading}
                      className={styles.deleteButton}
                    >
                      Delete Post
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && posts.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.emptyState}>
                    No posts found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {deleteTarget ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <button
              type="button"
              onClick={closeDeleteDialog}
              disabled={actionLoading}
              className={styles.closeButton}
              aria-label="Close dialog"
            >
              x
            </button>
            <h3 className={styles.modalTitle}>Confirm {deleteTarget.kind === "user" ? "Account Deletion" : "Post Deletion"}</h3>
            <p className={styles.modalSubtitle}>
              Target: <span className={styles.mono}>{deleteTarget.id}</span>
            </p>

            <form onSubmit={runDelete} className={styles.form}>
              <label className={styles.label}>
                Type confirmation
                <input
                  value={confirmInput}
                  onChange={(event) => setConfirmInput(event.target.value)}
                  placeholder={expectedConfirmation}
                  disabled={actionLoading}
                  className={styles.input}
                />
              </label>

              <label className={styles.label}>
                Reason {deleteTarget.kind === "user" ? "(required)" : "(optional)"}
                <textarea
                  rows={4}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={actionLoading}
                  className={styles.textarea}
                />
              </label>

              <div className={styles.formActions}>
                <button type="submit" disabled={actionLoading} className={styles.confirmButton}>
                  {actionLoading ? "Deleting..." : "Confirm Delete"}
                </button>
                <button type="button" onClick={closeDeleteDialog} disabled={actionLoading} className={styles.cancelButton}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
