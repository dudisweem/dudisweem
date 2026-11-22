import type { ReactNode } from "react";
import { AppShell } from "./AppShell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/domain/labels";

/** Server wrapper: enforces role, loads nav badges, renders the role's shell. */
export async function Shell({ roles, head, children }: { roles: Role[]; head: ReactNode; children: ReactNode }) {
  const me = await requireRole(...roles);
  let badges: Record<string, number> | undefined;
  const supabase = await createClient();
  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", me.id)
    .is("read_at", null);
  if (me.role === "admin") {
    const { count } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .gte("starts_at", new Date().toISOString());
    if (count) badges = { "/admin/requests": count };
  }
  return (
    <AppShell role={me.role} name={me.full_name || me.email} badges={badges} unread={unread ?? 0} head={head}>
      {children}
    </AppShell>
  );
}

export function Head({ kicker, title, children }: { kicker?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <>
      {kicker ? <span className="k">{kicker}</span> : null}
      <h1>{title}</h1>
      {children}
    </>
  );
}
