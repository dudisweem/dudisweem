"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { Wave } from "./primitives";
import type { Role } from "@/domain/labels";

type NavItem = { href: string; label: string; icon: IconName; exact?: boolean };

const NAV: Record<Role, NavItem[]> = {
  parent: [
    { href: "/home", label: "בית", icon: "home", exact: true },
    { href: "/book", label: "הזמנה", icon: "plus" },
    { href: "/lessons", label: "שיעורים", icon: "cal" },
    { href: "/kids", label: "ילדים", icon: "kids" },
    { href: "/account", label: "חשבון", icon: "user" },
  ],
  admin: [
    { href: "/admin", label: "היום", icon: "home", exact: true },
    { href: "/admin/requests", label: "בקשות", icon: "inbox" },
    { href: "/admin/calendar", label: "יומן", icon: "cal" },
    { href: "/admin/students", label: "תלמידים", icon: "kids" },
    { href: "/admin/manage", label: "ניהול", icon: "pen" },
  ],
  instructor: [
    { href: "/workday", label: "היום שלי", icon: "waves", exact: true },
    { href: "/account", label: "חשבון", icon: "user" },
  ],
};

export function AppShell({
  role,
  name,
  badges,
  unread = 0,
  head,
  children,
}: {
  role: Role;
  name: string;
  badges?: Partial<Record<string, number>>;
  unread?: number;
  head: ReactNode;
  children: ReactNode;
}) {
  const path = usePathname();
  const items = NAV[role];
  const isActive = (i: NavItem) => (i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/"));
  // "manage" covers every admin settings sub-page
  const manageActive = (i: NavItem) =>
    i.href === "/admin/manage" &&
    ["/admin/manage", "/admin/settings", "/admin/services", "/admin/schedule", "/admin/users", "/admin/packages", "/admin/announcements", "/admin/payments", "/admin/reports", "/admin/skills"].some(
      (p) => path === p || path.startsWith(p + "/"),
    );

  return (
    <div id="app">
      <header className="band">
        <div className="topnav">
          <Link href={items[0]!.href} className="brand" aria-label="SWEEMER דף הבית">
            SWEEMER
          </Link>
          <nav className="links" aria-label="ניווט ראשי">
            {items.map((i) => {
              const active = isActive(i) || manageActive(i);
              return (
                <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined}>
                  <Icon name={i.icon} small />
                  {i.label}
                  {badges?.[i.href] ? <span className="badge-n">{badges[i.href]}</span> : null}
                </Link>
              );
            })}
          </nav>
          <span className="grow" />
          <div className="who">
            {role !== "parent" ? (
              <Link href="/pool" className="pool-link">
                <Icon name="waves" small />
                מסך בריכה
              </Link>
            ) : null}
            <Link href="/notifications" className="bell" aria-label={unread ? `התראות, ${unread} חדשות` : "התראות"}>
              <Icon name="bell" />
              {unread ? <span className="badge-n">{unread > 99 ? "99+" : unread}</span> : null}
            </Link>
            <span>{name}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" aria-label="התנתקות">
                <Icon name="left" small />
                יציאה
              </button>
            </form>
          </div>
        </div>
        <div className="bhead">{head}</div>
        <Wave />
      </header>
      <main className="view">
        <div className="body">{children}</div>
      </main>
      {items.length > 1 ? (
        <nav className="tabs" aria-label="ניווט">
          {items.map((i) => {
            const active = isActive(i) || manageActive(i);
            return (
              <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined}>
                <Icon name={i.icon} />
                {i.label}
                {badges?.[i.href] ? <span className="dot">{badges[i.href]}</span> : null}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
