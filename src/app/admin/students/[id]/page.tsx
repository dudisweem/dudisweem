import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell, Head } from "@/ui/Shell";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { ageFrom, businessDay, fmtDate, fmtMoney, fmtTime, healthValid } from "@/domain/format";
import { LEVEL_LABEL, PAYMENT_LABEL, type BookingStatus, type Payment } from "@/domain/labels";
import { Empty, Pill, StatusPill, Vessel } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import { SubmitButton } from "@/ui/SubmitButton";
import { ConfirmButton } from "@/ui/admin/ConfirmButton";
import { Flash } from "../../_lib/Flash";
import { addCredit, deleteCredit, updateCredit, updateStudentAdmin } from "../actions";

export const metadata: Metadata = { title: "תלמיד" };

const GENDER: Record<string, string> = { m: "בן", f: "בת", other: "אחר" };

export default async function StudentDetail({ params, searchParams }: PageProps<"/admin/students/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const settings = await getSettings();

  const { data: s } = await supabase
    .from("students")
    .select("*, parent:profiles!students_parent_id_fkey ( id, full_name, phone, email )")
    .eq("id", id)
    .maybeSingle();
  if (!s) notFound();
  const parent = s.parent as unknown as { id: string; full_name: string; phone: string; email: string } | null;

  const [creditsRes, bookingsRes, packagesRes, siblingsRes] = await Promise.all([
    supabase.from("credits").select("*, package:packages ( name ), service:services ( name )").eq("student_id", id).order("created_at", { ascending: false }),
    supabase
      .from("bookings")
      .select("id, number, starts_at, status, price_agorot, payment_method, paid, service:services!bookings_service_id_fkey ( name ), instructor:profiles!bookings_instructor_id_fkey ( full_name )")
      .eq("student_id", id)
      .order("starts_at", { ascending: false })
      .limit(100),
    supabase.from("packages").select("id, name, lessons, price_agorot, validity_days").eq("active", true).order("name"),
    parent ? supabase.from("students").select("id, first_name, color").eq("parent_id", parent.id).neq("id", id) : Promise.resolve({ data: [] }),
  ]);
  const credits = (creditsRes.data ?? []) as unknown as {
    id: string; lessons_total: number; lessons_used: number; expires_at: string | null; paid: boolean; note: string; created_at: string;
    package: { name: string } | null; service: { name: string } | null;
  }[];
  const bookings = (bookingsRes.data ?? []) as unknown as {
    id: string; number: number; starts_at: string; status: BookingStatus; price_agorot: number; payment_method: Payment; paid: boolean;
    service: { name: string } | null; instructor: { full_name: string } | null;
  }[];
  const packages = packagesRes.data ?? [];
  const siblings = (siblingsRes.data ?? []) as { id: string; first_name: string; color: string }[];

  const back = `/admin/students/${id}`;
  const age = ageFrom(s.birth_date);
  const health = healthValid(s.health_signed_at, settings.health_validity_months, settings.health_required);
  const completed = bookings.filter((b) => b.status === "completed").length;
  const upcoming = bookings.filter((b) => ["pending", "approved"].includes(b.status) && new Date(b.starts_at) > new Date()).length;
  const answers = (s.health_answers ?? null) as Record<string, unknown> | null;

  return (
    <Shell
      roles={["admin"]}
      head={
        <Head kicker={parent ? `משפחת ${parent.full_name}` : "תלמיד"} title={`${s.first_name} ${s.last_name}`}>
          <div className="facts">
            {age !== null ? <span><Icon name="user" small />{GENDER[s.gender ?? ""] ?? ""} {age}</span> : null}
            <span><Icon name="waves" small />{LEVEL_LABEL[s.swim_level] ?? s.swim_level}</span>
            {!s.active ? <span><Icon name="lock" small />לא פעיל</span> : null}
          </div>
        </Head>
      }
    >
      <Flash sp={sp} />
      <div className="stud">
        <div className="stack">
          <section className="surf pad stack-s">
            <div className="stats">
              <div className="stat"><span className="big num">{completed}<em>שיעורים שהתקיימו</em></span></div>
              <div className="stat"><span className="big num">{upcoming}<em>שיעורים קרובים</em></span></div>
              <div className="stat">
                <span className="big num">
                  {credits.reduce((n, c) => n + (c.expires_at && new Date(c.expires_at) < new Date() ? 0 : c.lessons_total - c.lessons_used), 0)}
                  <em>יתרה בכרטיסיות</em>
                </span>
              </div>
            </div>
            <Link href={`/admin/bookings/new?student=${id}`} className="btn primary"><Icon name="plus" />קביעת שיעור</Link>
          </section>

          <section className="surf pad stack-s" aria-labelledby="par-h">
            <h2 id="par-h" style={{ margin: 0, fontSize: 16 }}>הורה</h2>
            {parent ? (
              <dl className="kv-grid">
                <dt>שם</dt><dd>{parent.full_name || "—"}</dd>
                <dt>טלפון</dt><dd>{parent.phone ? <a href={`tel:${parent.phone}`} dir="ltr">{parent.phone}</a> : "—"}</dd>
                <dt>מייל</dt><dd dir="ltr" style={{ textAlign: "right" }}>{parent.email}</dd>
                {s.emergency_name || s.emergency_phone ? (
                  <><dt>חירום</dt><dd>{s.emergency_name} <span dir="ltr">{s.emergency_phone}</span></dd></>
                ) : null}
              </dl>
            ) : <p className="muted">—</p>}
            {siblings.length ? (
              <div className="acts-row">
                <span className="small muted">אחים:</span>
                {siblings.map((x) => (
                  <Link key={x.id} href={`/admin/students/${x.id}`} className="chip"><span className="dot-c" style={{ background: x.color }} />{x.first_name}</Link>
                ))}
              </div>
            ) : null}
          </section>

          <section className="surf pad stack-s" aria-labelledby="hl-h">
            <div className="row">
              <h2 id="hl-h" className="grow" style={{ margin: 0, fontSize: 16 }}>בריאות</h2>
              {health ? <Pill kind="ok">הצהרה בתוקף</Pill> : <Pill kind="bad">אין הצהרה בתוקף</Pill>}
            </div>
            <span className="private"><Icon name="lock" small />מידע רפואי — גלוי למנהלים בלבד</span>
            {s.health_signed_at ? (
              <p className="small" style={{ margin: 0 }}>נחתם ב־{fmtDate(s.health_signed_at)} ע״י {s.health_signed_by}</p>
            ) : null}
            {s.allergies ? <p style={{ margin: 0 }}><b>אלרגיות: </b>{s.allergies}</p> : null}
            {s.medical_notes ? <p style={{ margin: 0 }}><b>הערות רפואיות: </b>{s.medical_notes}</p> : null}
            {answers ? (
              <ul className="health-list">
                {Object.entries(answers).map(([k, v]) => (
                  <li key={k}><b>{k}:</b> {typeof v === "boolean" ? (v ? "כן" : "לא") : String(v)}</li>
                ))}
              </ul>
            ) : null}
          </section>

          <form action={updateStudentAdmin} className="surf pad stack-s">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="back" value={back} />
            <div className="field">
              <label htmlFor="swim_level">רמת שחייה</label>
              <select className="inp" id="swim_level" name="swim_level" defaultValue={s.swim_level}>
                {Object.entries(LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="notes">הערות</label>
              <textarea className="inp" id="notes" name="notes" defaultValue={s.notes} maxLength={2000} />
            </div>
            <label className="toggle">
              <span className="col"><b>תלמיד פעיל</b><small>תלמיד לא פעיל לא יופיע בהזמנות</small></span>
              <input type="checkbox" name="active" defaultChecked={s.active} />
            </label>
            <SubmitButton variant="solid" sm>שמירה</SubmitButton>
          </form>
        </div>

        <div className="stack">
          <section className="stack-s" aria-labelledby="cr-h">
            <div className="sec-h"><h2 id="cr-h">כרטיסיות</h2></div>
            {credits.length === 0 ? <div className="surf"><Empty icon="card">אין כרטיסיות לתלמיד.</Empty></div> : null}
            {credits.map((c) => {
              const left = c.lessons_total - c.lessons_used;
              const expired = c.expires_at ? new Date(c.expires_at) < new Date() : false;
              return (
                <div key={c.id} className="surf stack-s" style={{ paddingBottom: 12 }}>
                <form action={updateCredit} className="pad stack-s" style={{ paddingBottom: 0 }}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="back" value={back} />
                  <div className="row">
                    <Vessel level={(left / c.lessons_total) * 100} size="sm" label={`נותרו ${left} מתוך ${c.lessons_total}`} />
                    <div className="col grow">
                      <b>{c.package?.name ?? "כרטיסייה"}</b>
                      <small>{c.service?.name ?? "כל סוגי השיעורים"} · נותרו {left} מתוך {c.lessons_total}</small>
                    </div>
                    {expired ? <Pill kind="bad">פג תוקף</Pill> : c.paid ? <Pill kind="ok">שולם</Pill> : <Pill kind="wait">לא שולם</Pill>}
                  </div>
                  <div className="form-grid">
                    <div className="field"><label htmlFor={`t-${c.id}`}>סה״כ שיעורים</label><input className="inp sm" id={`t-${c.id}`} name="total" type="number" min={1} max={200} defaultValue={c.lessons_total} /></div>
                    <div className="field"><label htmlFor={`u-${c.id}`}>נוצלו</label><input className="inp sm" id={`u-${c.id}`} name="used" type="number" min={0} max={200} defaultValue={c.lessons_used} /></div>
                    <div className="field"><label htmlFor={`e-${c.id}`}>בתוקף עד</label><input className="inp sm" id={`e-${c.id}`} name="expires" type="date" defaultValue={c.expires_at ? businessDay(c.expires_at) : ""} /></div>
                  </div>
                  <label className="ck"><input type="checkbox" name="paid" defaultChecked={c.paid} />שולם</label>
                  <SubmitButton variant="solid" sm>עדכון</SubmitButton>
                </form>
                <form action={deleteCredit} className="acts-row" style={{ padding: "0 16px" }}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="back" value={back} />
                  <ConfirmButton question={`למחוק את ${c.package?.name ?? "הכרטיסייה"}?`} confirmLabel="מחיקה">מחיקת כרטיסייה</ConfirmButton>
                </form>
                </div>
              );
            })}
            {packages.length ? (
              <form action={addCredit} className="surf pad stack-s">
                <input type="hidden" name="student" value={id} />
                <input type="hidden" name="back" value={back} />
                <b>הוספת כרטיסייה</b>
                <select className="inp" name="package" aria-label="חבילה" required>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} · {p.lessons} שיעורים · {fmtMoney(p.price_agorot)} · {p.validity_days} ימים</option>
                  ))}
                </select>
                <input className="inp sm" name="note" placeholder="הערה (לא חובה)" maxLength={300} />
                <label className="ck"><input type="checkbox" name="paid" />שולם</label>
                <SubmitButton variant="primary" sm><Icon name="plus" />הוספה</SubmitButton>
              </form>
            ) : (
              <p className="small muted">אין חבילות פעילות. <Link className="link" href="/admin/packages">יצירת חבילה</Link></p>
            )}
          </section>

          <section className="stack-s" aria-labelledby="bk-h">
            <div className="sec-h"><h2 id="bk-h">היסטוריית שיעורים</h2></div>
            <div className="surf list">
              {bookings.length === 0 ? <Empty icon="cal">אין שיעורים עדיין.</Empty> : null}
              {bookings.map((b) => (
                <Link key={b.id} href={`/admin/bookings/${b.id}`} className="li" style={{ textDecoration: "none", color: "inherit" }}>
                  <span className="tm num">{fmtTime(b.starts_at)}<small>{fmtDate(b.starts_at)}</small></span>
                  <span className="col grow">
                    <b>{b.service?.name}</b>
                    <small>{b.instructor?.full_name} · {PAYMENT_LABEL[b.payment_method]} {b.payment_method !== "card" ? `· ${fmtMoney(b.price_agorot)}${b.paid ? " · שולם" : ""}` : ""}</small>
                  </span>
                  <StatusPill status={b.status} />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Shell>
  );
}
