import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { loadPool } from "./actions";
import { PoolBoard } from "@/ui/PoolBoard";

export const metadata: Metadata = { title: "מסך בריכה" };

export default async function PoolPage() {
  const me = await requireRole("admin", "instructor");
  const initial = await loadPool();
  return <PoolBoard initial={"error" in initial ? null : initial} backHref={me.role === "admin" ? "/admin" : "/workday"} />;
}
