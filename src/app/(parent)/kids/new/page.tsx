import type { Metadata } from "next";
import Link from "next/link";
import { Shell, Head } from "@/ui/Shell";
import { requireRole } from "@/lib/auth";
import { KidForm } from "@/ui/parent/KidForm";

export const metadata: Metadata = { title: "רישום ילד" };

export default async function NewKidPage() {
  const me = await requireRole("parent", "admin", "instructor");
  const lastName = me.full_name.trim().split(/\s+/).slice(1).join(" ");
  return (
    <Shell roles={["parent", "admin", "instructor"]} head={<Head kicker={<Link href="/kids" style={{ color: "inherit" }}>הילדים שלי</Link>} title="רישום ילד חדש" />}>
      <p className="muted" style={{ margin: "0 4px" }}>אחרי השמירה נבקש הצהרת בריאות קצרה — ואז אפשר להזמין שיעור.</p>
      <KidForm defaultLastName={lastName} />
    </Shell>
  );
}
