import type { Metadata } from "next";
import Link from "next/link";
import { Shell, Head } from "@/ui/Shell";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { fmtDate } from "@/domain/format";
import { ROLE_LABEL, type Role } from "@/domain/labels";
import { Alert, Avatar, Empty, Pill } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import { SubmitButton } from "@/ui/SubmitButton";
import { ConfirmButton } from "@/ui/admin/ConfirmButton";
import { Flash } from "../_lib/Flash";
import { setActive, setRole, updateUser } from "./actions";

export const metadata: Metadata = { title: "משתמשים" };

const STAFF_COLORS = ["#1D6E9E", "#0E2F4B", "#15603A", "#874400", "#9A1D1D", "#6A4C93", "#2A9D8F"];

type P = { id: string; email: string; full_name: string; phone: string; role: Role; is_owner: boolean; active: boolean; color: string; created_at: string };

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const sp = await searchParams;
  const me = await requireRole("admin");
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const roleFilter = typeof sp.role === "string" && ["admin", "instructor", "parent"].includes(sp.role) ? (sp.role as Role) : null;
  const supabase = await createClient();
  const [{ data }, kidsRes] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("students").select("parent_id").eq("active", true),
  ]);
  const all = (data ?? []) as P[];
  const kidCount = new Map<string, number>();
  for (const k of kidsRes.data ?? []) kidCount.set(k.parent_id, (kidCount.get(k.parent_id) ?? 0) + 1);

  let rows = all;
  if (roleFilter) rows = rows.filter((r) => r.role === roleFilter);
  if (q) {
    const ql = q.toLowerCase();
    rows = rows.filter((r) => r.full_name.includes(q) || r.email.toLowerCase().includes(ql) || r.phone.includes(q));
  }
  const counts = { admin: 0, instructor: 0, parent: 0 } as Record<Role, number>;
  for (const r of all) counts[r.role]++;
  const back = `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), ...(roleFilter ? { role: roleFilter } : {}) }).toString()}`;
  const link = (role: string) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), ...(role ? { role } : {}) }).toString()}`;

  return (
    <Shell
      roles={["admin"]}
      head={
        <Head kicker="ניהול" title="משתמשים והרשאות">
          <div className="facts">
            <span><Icon name="user" small />{counts.admin} מנהלים</span>
            <span><Icon name="waves" small />{counts.instructor} מדריכים</span>
            <span><Icon name="kids" small />{counts.parent} הורים</span>
          </div>
        </Head>
      }
    >
      <Flash sp={sp} />
      <Alert kind="info">
        כל אחד נרשם בעצמו (מייל וסיסמה או Google) ומקבל חשבון הורה. כדי להוסיף מדריך או מנהל: בקשו ממנו להירשם, ואז שנו כאן את התפקיד שלו.
        מנהל יכול לשנות הכל; מדריך רואה רק את השיעורים שלו, בלי מידע רפואי ותשלומים.
      </Alert>
      <form className="search" role="search" action="/admin/users">
        <Icon name="search" />
        <input className="inp" name="q" defaultValue={q} placeholder="חיפוש לפי שם, מייל או טלפון" aria-label="חיפוש משתמש" />
        {roleFilter ? <input type="hidden" name="role" value={roleFilter} /> : null}
      </form>
      <nav className="subnav" aria-label="סינון לפי תפקיד">
        <Link href={link("")} aria-current={!roleFilter ? "page" : undefined}>כולם</Link>
        {(["admin", "instructor", "parent"] as Role[]).map((r) => (
          <Link key={r} href={link(r)} aria-current={roleFilter === r ? "page" : undefined}>{ROLE_LABEL[r]}</Link>
        ))}
      </nav>

      <div className="stack-s">
        {rows.length === 0 ? <div className="surf"><Empty icon="user">לא נמצאו משתמשים.</Empty></div> : null}
        {rows.map((u) => (
          <details key={u.id} className="surf">
            <summary>
              <span className="row" style={{ minWidth: 0 }}>
                <Avatar name={u.full_name || u.email} color={u.color} />
                <span className="col">
                  <b>{u.full_name || "ללא שם"} {u.is_owner ? <span className="tag-owner">בעלים</span> : null}</b>
                  <small className="muted" dir="ltr" style={{ textAlign: "right" }}>{u.email}</small>
                </span>
              </span>
              <span className="acts-row">
                {!u.active ? <Pill kind="bad">מושהה</Pill> : null}
                <Pill kind={u.role === "admin" ? "live" : u.role === "instructor" ? "free" : "done"}>{ROLE_LABEL[u.role]}</Pill>
              </span>
            </summary>
            <div className="pad stack">
              <dl className="kv-grid">
                <dt>טלפון</dt><dd>{u.phone ? <a href={`tel:${u.phone}`} dir="ltr">{u.phone}</a> : "—"}</dd>
                <dt>נרשם</dt><dd>{fmtDate(u.created_at)}</dd>
                {kidCount.get(u.id) ? (<><dt>ילדים</dt><dd><Link className="link" href={`/admin/students?q=${encodeURIComponent(u.full_name)}`}>{kidCount.get(u.id)} ילדים</Link></dd></>) : null}
              </dl>

              {u.is_owner ? (
                <p className="small muted" style={{ margin: 0 }}><Icon name="lock" small /> בעל המערכת — התפקיד והסטטוס נעולים.</p>
              ) : (
                <form action={setRole} className="stack-s">
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="back" value={back} />
                  <span className="small" style={{ fontWeight: 700 }}>תפקיד</span>
                  <div className="acts-row">
                    {(["parent", "instructor", "admin"] as Role[]).map((r) => (
                      <SubmitButton key={r} name="role" value={r} variant={u.role === r ? "solid" : "ghost"} sm disabled={u.role === r} aria-pressed={u.role === r}>
                        {ROLE_LABEL[r]}
                      </SubmitButton>
                    ))}
                  </div>
                </form>
              )}

              <form action={updateUser} className="stack-s">
                <input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="back" value={back} />
                <div className="cols2">
                  <div className="field"><label htmlFor={`fn-${u.id}`}>שם מלא</label><input className="inp" id={`fn-${u.id}`} name="full_name" defaultValue={u.full_name} maxLength={120} /></div>
                  <div className="field"><label htmlFor={`ph-${u.id}`}>טלפון</label><input className="inp ltr" dir="ltr" id={`ph-${u.id}`} name="phone" type="tel" defaultValue={u.phone} maxLength={30} /></div>
                </div>
                {u.role !== "parent" ? (
                  <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend className="small" style={{ fontWeight: 700, marginBottom: 6 }}>צבע ביומן</legend>
                    <div className="color-pick">
                      {STAFF_COLORS.map((c) => (
                        <label key={c}>
                          <input type="radio" name="color" value={c} defaultChecked={u.color.toLowerCase() === c.toLowerCase()} />
                          <span style={{ background: c }} aria-label={c} />
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : null}
                <SubmitButton variant="quiet" sm>שמירת פרטים</SubmitButton>
              </form>

              {!u.is_owner && u.id !== me.id ? (
                <form action={setActive}>
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="active" value={u.active ? "false" : "true"} />
                  {u.active ? (
                    <ConfirmButton question={`להשהות את ${u.full_name || u.email}? לא יוכל להתחבר.`} confirmLabel="השהיה">השהיית חשבון</ConfirmButton>
                  ) : (
                    <SubmitButton variant="solid" sm>הפעלת החשבון מחדש</SubmitButton>
                  )}
                </form>
              ) : null}
            </div>
          </details>
        ))}
      </div>
    </Shell>
  );
}
