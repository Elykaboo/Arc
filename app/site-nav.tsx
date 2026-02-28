"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useEffect, useRef, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth } from "@/lib/firebase";
import { db } from "@/lib/firebase";
import { listFollowersForUser, type FollowerEntry } from "@/lib/follow-db";
import { saveMemberProfile } from "@/lib/member-db";
import { savePublicUserProfile } from "@/lib/public-profile-db";
import { loadUserProfile, saveUserProfile, type UserProfile } from "@/lib/profile-db";

type NavItem = {
  href: string;
  label: string;
  match?: "exact" | "startsWith";
};

const navItems: NavItem[] = [
  { href: "/socializing", label: "Home", match: "startsWith" },
  { href: "/community", label: "Community", match: "startsWith" },
  { href: "/", label: "Training Dashboard", match: "exact" },
  { href: "/workouts", label: "Workouts", match: "startsWith" },
  { href: "/planner", label: "Planner", match: "startsWith" },
  { href: "/routines", label: "Routines", match: "startsWith" },
];

const isActiveItem = (pathname: string, item: NavItem) => {
  if (item.match === "exact") {
    return pathname === item.href;
  }

  if (item.href === "/") {
    return pathname === "/";
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
};

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "G";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

function IconBase({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className ?? "h-5 w-5"}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
    </IconBase>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M6 16h12" />
      <path d="M8.5 16V11a3.5 3.5 0 1 1 7 0v5" />
      <path d="M10.5 19a1.5 1.5 0 0 0 3 0" />
    </IconBase>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5V5M12 19V21.5M2.5 12H5M19 12h2.5M5.1 5.1l1.8 1.8M17.1 17.1l1.8 1.8M18.9 5.1l-1.8 1.8M6.9 17.1l-1.8 1.8" />
    </IconBase>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <IconBase className={className}>
      <path d="M20.2 14.4A8 8 0 1 1 9.6 3.8a6.5 6.5 0 0 0 10.6 10.6Z" />
    </IconBase>
  );
}

export default function SiteNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profileName, setProfileName] = useState("Guest");
  const [profilePhoto, setProfilePhoto] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [notifications, setNotifications] = useState<FollowerEntry[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [lastReadAtMs, setLastReadAtMs] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof document === "undefined") {
      return false;
    }
    return document.documentElement.classList.contains("dark");
  });

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setIsAuthResolved(true);
      setIsAuthenticated(Boolean(user?.emailVerified));
      setCurrentUserId(user?.emailVerified ? user.uid : "");

      const fallbackName = user?.email?.split("@")[0] || "Guest";
      const resolvedName = user?.displayName?.trim() || fallbackName;
      setProfileName(resolvedName);
      setProfilePhoto(user?.photoURL || "");

      if (!user?.uid || !user.emailVerified) {
        return;
      }

      try {
        const storedProfile = await loadUserProfile(user.uid);
        const syncedProfile: UserProfile = {
          username:
            storedProfile?.username?.trim() || user.displayName?.trim() || user.email?.split("@")[0] || "Arc User",
          gender: storedProfile?.gender ?? "",
          bio: storedProfile?.bio ?? "",
          workoutSplit: storedProfile?.workoutSplit ?? "",
          photoDataUrl: storedProfile?.photoDataUrl?.trim() || user.photoURL?.trim() || "",
        };

        if (storedProfile?.username?.trim()) {
          setProfileName(storedProfile.username.trim());
        }
        if (storedProfile?.photoDataUrl?.trim()) {
          setProfilePhoto(storedProfile.photoDataUrl.trim());
        }

        try {
          await saveUserProfile(user.uid, syncedProfile);
          await saveMemberProfile(user.uid, syncedProfile);
          await savePublicUserProfile(user.uid, syncedProfile);
        } catch {
          // Keep navigation responsive even if profile sync fails.
        }
      } catch {
        // Use auth fallback values when profile read fails.
        // Preserve auth fallback UI without overwriting existing profile data.
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      setLastReadAtMs(0);
      return;
    }
    const stored = window.localStorage.getItem(`notifications:lastRead:${currentUserId}`);
    const parsed = stored ? Number(stored) : 0;
    setLastReadAtMs(Number.isFinite(parsed) ? parsed : 0);
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      setNotifications([]);
      setNotificationsLoading(false);
      return;
    }
    setNotificationsLoading(true);

    const notificationsQuery = query(
      collection(db, "users", currentUserId, "followers"),
      orderBy("createdAt", "desc"),
      limit(50),
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const items: FollowerEntry[] = snapshot.docs.map((document) => {
          const data = document.data();
          const createdAt = data.createdAt;
          return {
            uid: document.id,
            username: typeof data.username === "string" ? data.username : "",
            photoDataUrl: typeof data.photoDataUrl === "string" ? data.photoDataUrl : "",
            createdAtMs:
              createdAt && typeof createdAt.toMillis === "function" ? createdAt.toMillis() : null,
          };
        });
        setNotifications(items);
        setNotificationsLoading(false);
      },
      () => {
        // Fallback when listeners are blocked by environment/network/rules.
        void (async () => {
          try {
            const followers = await listFollowersForUser(currentUserId, 50);
            setNotifications(followers);
          } catch {
            setNotifications([]);
          } finally {
            setNotificationsLoading(false);
          }
        })();
      },
    );

    return unsubscribe;
  }, [currentUserId]);

  useEffect(() => {
    const handleProfileUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<UserProfile>;
      const updated = customEvent.detail;
      if (!updated) return;

      if (updated.username?.trim()) {
        setProfileName(updated.username.trim());
      }
      setProfilePhoto(updated.photoDataUrl?.trim() || "");
    };

    window.addEventListener("profile-updated", handleProfileUpdated as EventListener);
    return () => {
      window.removeEventListener("profile-updated", handleProfileUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setNotificationsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const toggleTheme = () => {
    const nextIsDark = !isDarkMode;
    document.documentElement.classList.toggle("dark", nextIsDark);
    window.localStorage.setItem("theme", nextIsDark ? "dark" : "light");
    setIsDarkMode(nextIsDark);
  };

  const initials = getInitials(profileName);
  const showMemberNav = isAuthResolved && isAuthenticated;
  const unreadCount = notifications.filter(
    (item) => item.createdAtMs !== null && item.createdAtMs > lastReadAtMs,
  ).length;

  const markAllNotificationsRead = () => {
    if (!currentUserId) return;
    const now = Date.now();
    window.localStorage.setItem(`notifications:lastRead:${currentUserId}`, String(now));
    setLastReadAtMs(now);
  };

  const formatRelativeTime = (timestampMs: number | null) => {
    if (!timestampMs) return "Just now";
    const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
    if (deltaSeconds < 60) return "Just now";
    if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)}m ago`;
    if (deltaSeconds < 86400) return `${Math.floor(deltaSeconds / 3600)}h ago`;
    return `${Math.floor(deltaSeconds / 86400)}d ago`;
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_60%,#eef2f7_100%)] text-slate-900 shadow-[0_10px_28px_rgba(15,23,42,0.12)] print:hidden dark:border-slate-700/70 dark:bg-[linear-gradient(180deg,#031029_0%,#041737_62%,#072041_100%)] dark:text-slate-100 dark:shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
      <div className="mx-auto grid h-16 w-full max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="group inline-flex justify-self-start items-center gap-2 font-serif text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl dark:text-white"
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-400/10 shadow-[0_0_14px_rgba(34,211,238,0.18)] sm:h-8 sm:w-8 dark:border-cyan-200/45 dark:bg-cyan-300/10 dark:shadow-[0_0_18px_rgba(34,211,238,0.28)]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-4 w-4 text-cyan-700 dark:text-cyan-200"
              aria-hidden="true"
            >
              <path d="M8 10v4M10 9v6M14 9v6M16 10v4" />
              <path d="M5 9v6M19 9v6" />
              <path d="M4 12h16" />
            </svg>
          </span>
          <span className="transition-transform duration-300 group-hover:-translate-y-[1px]">arc</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center justify-center gap-1 lg:flex">
          {showMemberNav
            ? navItems.map((item) => {
                const isActive = isActiveItem(pathname, item);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                      isActive
                        ? "bg-slate-900 text-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.18)] dark:bg-white/18 dark:text-white dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]"
                        : "text-slate-700 hover:bg-slate-900/10 hover:text-slate-900 dark:text-slate-200/90 dark:hover:bg-white/10 dark:hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })
            : null}
        </nav>

        <div className="relative flex justify-self-end items-center gap-2" ref={menuRef}>
          {showMemberNav ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setNotificationsOpen((value) => !value);
                  setMenuOpen(false);
                }}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 dark:border-white/20 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/20"
                aria-label="Notifications"
                aria-haspopup="menu"
                aria-expanded={notificationsOpen}
              >
                <BellIcon className="h-5 w-5" />
                {unreadCount > 0 ? (
                  <span className="absolute right-2 top-2 block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" />
                ) : null}
              </button>

              {notificationsOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-3 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,250,252,0.95))] p-1.5 text-slate-900 shadow-[0_16px_40px_rgba(2,6,23,0.22)] backdrop-blur-md dark:border-white/20 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.97),rgba(15,23,42,0.92))] dark:text-slate-100 dark:shadow-[0_16px_40px_rgba(2,6,23,0.45)]"
                >
                  <div className="mb-1 flex items-center justify-between rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/70">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notifications</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={markAllNotificationsRead}
                      disabled={unreadCount === 0}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Mark all as read
                    </button>
                  </div>

                  <div className="max-h-72 overflow-y-auto">
                    {notificationsLoading ? (
                      <p className="px-3 py-3 text-sm text-slate-500 dark:text-slate-300">Loading notifications...</p>
                    ) : notifications.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-slate-500 dark:text-slate-300">No notifications yet.</p>
                    ) : (
                      notifications.map((item) => {
                        const isUnread = item.createdAtMs !== null && item.createdAtMs > lastReadAtMs;
                        return (
                          <Link
                            key={item.uid}
                            href={`/users/${item.uid}`}
                            onClick={() => setNotificationsOpen(false)}
                            className={`block rounded-xl px-3 py-2 transition hover:bg-slate-100 dark:hover:bg-slate-700 ${
                              isUnread ? "bg-red-50/60 dark:bg-red-500/10" : ""
                            }`}
                            role="menuitem"
                          >
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              <span className="font-semibold">{item.username || "Someone"}</span> followed you.
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-300">
                              {formatRelativeTime(item.createdAtMs)}
                            </p>
                          </Link>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 dark:border-white/20 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/20"
            aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            title={isDarkMode ? "Light mode" : "Dark mode"}
          >
            {isDarkMode ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
          </button>

          {showMemberNav ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen((value) => !value);
                  setNotificationsOpen(false);
                }}
                className="flex items-center gap-2 rounded-full border border-slate-300 bg-white py-1.5 pl-1.5 pr-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Open account menu"
              >
                {profilePhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profilePhoto}
                    alt={`${profileName} profile`}
                    className="h-7 w-7 rounded-full border border-slate-300 object-cover dark:border-white/35"
                  />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-white/90 dark:text-slate-900">
                    {initials}
                  </span>
                )}
                <span className="hidden max-w-[120px] truncate sm:inline">{profileName}</span>
                <UserIcon className="h-4 w-4 text-slate-600 dark:text-white/80" />
              </button>

              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-3 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,250,252,0.95))] p-1.5 text-slate-900 shadow-[0_16px_40px_rgba(2,6,23,0.22)] backdrop-blur-md dark:border-white/20 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.97),rgba(15,23,42,0.92))] dark:text-slate-100 dark:shadow-[0_16px_40px_rgba(2,6,23,0.45)]"
                >
                  <div className="mb-1 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/70">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{profileName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Account menu</p>
                  </div>
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700"
                    role="menuitem"
                  >
                    Profile
                  </Link>
                  <button
                    type="button"
                    onClick={async () => {
                      await signOut(auth);
                      setMenuOpen(false);
                      router.push("/");
                    }}
                    className="block w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                    role="menuitem"
                  >
                    Logout
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 dark:border-white/25 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>

      {showMemberNav ? (
        <nav aria-label="Mobile Primary" className="border-t border-slate-200 px-4 py-2 lg:hidden dark:border-white/15">
          <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto pb-1">
            {navItems.map((item) => {
              const isActive = isActiveItem(pathname, item);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    isActive
                      ? "bg-slate-900 text-white dark:bg-white/20 dark:text-white"
                      : "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
