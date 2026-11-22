import type { Metadata } from "next";
import Link from "next/link";
import { Shell, Head } from "@/ui/Shell";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { ageFrom, healthValid } from "@/domain/format";
import { LEVEL_LABEL } from "@/domain/labels";
import { Avatar, Empty, Pill } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";

export const metadata: Metadata = { title: "תלמידים" };

export default async function StudentsPage({ searchParams }: PageProps<"/admin/students">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const filter = typeof sp.filter === "string" ? sp.filter : "all";
  const supabase = await createClient();
  const settings = await getSettings();

  const { data } = await supabase
    .from("students")
    .select("id, first_name, last_name, birth_date, swim_level, color, active, health_signed_at, parent:profiles!students_parent_id_fkey ( full_name, phone, email )")
    .order("first_name");

  type Row = {
    id: string; first_name: string; last_name: string; birth_date: string | null; swim_level: string; color: string; active: boolean;
    health_signed_at: string | null; parent: { full_name: string; phone: string; email: string } | null;
  };
  let rows = (data ?? []) as unknown as Row[];
  const okHealth = (r: Row) => healthValid(r.health_signed_at, settings.health_validity_months, settings.health_required);
  if (q) {
    const ql = q.toLowerCase();
    rows = rows.filter((r) =>
      `${r.first_name} ${r.last_name}`.includes(q) ||
      (r.parent?.full_name ?? "").includes(q) ||
      (r.parent?.phone ?? "").includes(q) ||
      (r.parent?.email ?? "").toLowerCase().includes(ql),
    );
  }
  if (filter === "health") rows = rows.filter((r) => r.active && !okHealth(r));
  else if (filter === "inactive") rows = rows.filter((r) => !r.active);
  else rows = rows.filter((r) => r.active);

  const total = (data ?? []).length;
  const link = (f: string) => `/admin/students?${new URLSearchParams({ ...(q ? { q } : {}), filter: f }).toString()}`;

  return (
    <Shell
      roles={["admin"]}
      head={
        <Head kicker="כל המשפחות" title="תלמידים">
          <div className="facts"><span><Icon name="kids" small />{total} ילדים רשומים</span></div>
        </Head>
      }
    >
      <form className="search" role="search" action="/admin/students">
        <Icon name="search" />
        <input className="inp" name="q" defaultValue={q} placeholder="חיפוש לפי ילד, הורה, טלפון או מייל" aria-label="חיפוש" />
        <input type="hidden" name="filter" value={filter} />
      </form>
      <nav className="subnav" aria-label="סינון">
        <Link href={link("all")} aria-current={filter === "all" ? "page" : undefined}>פעילים</Link>
        <Link href={link("health")} aria-current={filter === "health" ? "page" : undefined}><Icon name="heart" small />בלי הצהרת בריאות</Link>
        <Link href={link("inactive")} aria-current={filter === "inactive" ? "page" : undefined}>לא פעילים</Link>
      </nav>
      <div className="surf list">
        {rows.length === 0 ? (
          <Empty icon="kids">{q ? "לא נמצאו תלמידים לחיפוש הזה." : "עדיין אין תלמידים. הורים מוסיפים ילדים אחרי ההרשמה."}</Empty>
        ) : (
          rows.map((r) => {
            const age = ageFrom(r.birth_date);
            return (
              <Link key={r.id} href={`/admin/students/${r.id}`} className="srow" style={{ textDecoration: "none", color: "inherit" }}>
                <Avatar name={r.first_name} color={r.color} />
                <span className="col grow">
                  <b>{r.first_name} {r.last_name}</b>
                  <small>
                    {age !== null ? `בן/בת ${age} · ` : ""}{LEVEL_LABEL[r.swim_level] ?? r.swim_level} · {r.parent?.full_name || "—"}
                  </small>
                </span>
                {okHealth(r) ? <Pill kind="ok">בריאות</Pill> : <Pill kind="bad">חסרה הצהרה</Pill>}
                <Icon name="left" small />
              </Link>
            );
          })
        )}
      </div>
    </Shell>
  );
}
