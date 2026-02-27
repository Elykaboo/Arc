"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  match?: "exact" | "startsWith";
};

const navItems: NavItem[] = [
  { href: "/", label: "Home", match: "exact" },
  { href: "/workouts", label: "Workouts", match: "startsWith" },
  { href: "/planner", label: "Planner", match: "startsWith" },
  { href: "/routines", label: "Routines", match: "startsWith" },
  { href: "/print/weekly", label: "Print", match: "startsWith" },
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

export default function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="print:hidden">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 py-4 sm:px-6">
        {navItems.map((item) => {
          const isActive = isActiveItem(pathname, item);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                isActive
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
