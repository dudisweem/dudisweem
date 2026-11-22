import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/ui/Shell";
import { requireRole, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ageFrom, fmtDate, fmtShortDay, fmtTime, healthValid } from "@/domain/format";
import { LEVEL_LABEL, STATUS } from "@/domain/labels";
import { Alert, Pill, Vessel } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import { KidForm } from "@/ui/parent/KidForm";
import { getBookings, getGuardians, getInstructorNames, getMedical, type Credit, type Kid } from "../../data";
import { Guardians } from "@/ui/parent/Guardians";
import { setKidActive } from "../../actions";
import { ConfirmAction } from "@/ui/parent/ConfirmAction";
import { ProgressView } from "@/ui/ProgressView";
import { loadProgress } from "@/lib/progress";

export const metadata: Metadata = { title: "כרטיס ילד" };

export default async function KidPage({ params, searchParams }: PageProps<"/kids/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireRole("parent", "admin", "instructor");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  // RLS: returns a row only for the owner parent, an accepted guardian, or an admin
  const { data: kidRow } = await supabase.from("students").select("*").eq("id", id).maybeSingle();
  if (!kidRow) notFound();
  const kid = kidRow as Kid;
  const [settings, bookings, instructors, { data: creditRows }, medical, guardians, progress] = await Promise.all([
    getSettings(),
    getBookings([kid.id]),
    getInstructorNames(),
    supabase.from("credits").select("*").eq("student_id", kid.id).order("created_at", { ascending: false }),
    getMedical(kid.id),
    getGuardians(kid.id),
    loadProgress(kid.id),
  ]);
  const isOwner = kid.parent_id === me.id;
  const credits = (creditRows ?? []) as Credit[];
  const now = new Date();
  const upcoming = bookings.filter((b) => new Date(b.starts_at) > now && (b.status === "pending" || b.status === "approved"));
  const past = bookings.filter((b) => !upcoming.includes(b)).reverse();
  const completed = bookings.filter((b) => b.status === "completed").length;
  const ok = healthValid(kid.health_signed_at, settings.health_validity_months, settings.health_required);
  let validUntil: string | null = null;
  if (kid.health_signed_at) {
    const d = new Date(kid.health_signed_at);
    d.setMonth(d.getMonth() + settings.health_validity_months);
    validUntil = fmtDate(d);
  }
  const usable = credits.filter((c) => !c.expires_at || new Date(c.expires_at) > now);
  const left = usable.reduce((s, c) => s + c.lessons_total - c.lessons_used, 0);
  const total = usable.reduce((s, c) => s + c.lessons_total, 0);
  const age = ageFrom(kid.birth_date);

  return (
    <Shell
      roles={["parent", "admin", "instructor"]}
      head={
        <div className="row" style={{ gap: 14 }}>
          <span className="av xl" style={{ background: kid.color, boxShadow: "0 0 0 4px rgba(169,216,235,.3)" }} aria-hidden="true">{kid.first_name.charAt(0)}</span>
          <span className="col">
            <h1>{kid.first_name} {kid.last_name}</h1>
            <span className="k">{[age !== null ? `גיל ${age}` : null, LEVEL_LABEL[kid.swim_level]].filter(Boolean).join(" · ")}</span>
          </span>
        </div>
      }
    >
      {sp.new ? <Alert kind="ok">{kid.first_name} נוסף/ה לחשבון. השלב הבא: הצהרת בריאות.</Alert> : null}
      {sp.signed ? <Alert kind="ok">הצהרת הבריאות נשמרה. אפשר להזמין שיעור.</Alert> : null}

      {!ok ? (
        <div className="surf pad row">
          <span className="av m" style={{ background: "var(--wait-bg)", color: "var(--wait)" }}><Icon name="heart" /></span>
          <span className="col grow">
            <b>{kid.health_signed_at ? "הצהרת הבריאות פגה" : "חסרה הצהרת בריאות"}</b>
            <small>נדרשת לפני הזמנת שיעור</small>
          </span>
          <Link className="btn primary sm" href={`/kids/${kid.id}/health`}>למילוי</Link>
        </div>
      ) : null}

      <div className="surf">
        <div className="stats pad">
          <div className="stat"><span className="big num">{completed}<em>שיעורים שהתקיימו</em></span></div>
          <div className="stat" style={{ justifyItems: "start" }}>
            {total > 0 ? (
              <>
                <Vessel level={Math.round((left / total) * 100)} size="sm" label={`נותרו ${left} מתוך ${total}`} />
                <span className="big num" style={{ fontSize: 30 }}>{left}/{total}<em>בכרטיסייה</em></span>
              </>
            ) : (
              <span className="big" style={{ fontSize: 24 }}>אין<em>כרטיסייה פעילה</em></span>
            )}
          </div>
          <div className="stat">
            {ok ? <Pill kind="ok">בתוקף</Pill> : <Pill kind="wait">לא בתוקף</Pill>}
            <small className="hint">{ok && validUntil ? `בריאות עד ${validUntil}` : "הצהרת בריאות"}</small>
          </div>
        </div>
      </div>

      {ok ? (
        <Link className="btn primary full" href={`/book?kid=${kid.id}`}><Icon name="plus" />הזמנת שיעור ל{kid.first_name}</Link>
      ) : null}

      <div className="sec-h"><h2>ההתקדמות של {kid.first_name}</h2></div>
      <ProgressView summary={progress} title={`ההתקדמות של ${kid.first_name}`} />

      <div className="sec-h"><h2>שיעורים קרובים</h2></div>
      <div className="surf list">
        {upcoming.length === 0 ? (
          <div className="empty"><Icon name="cal" /><div>אין שיעורים קרובים</div></div>
        ) : (
          upcoming.map((b) => (
            <div key={b.id} className="li">
              <span className="tm num">{fmtTime(b.starts_at)}<small>{fmtShortDay(b.starts_at)} {fmtDate(b.starts_at).slice(0, -5)}</small></span>
              <span className="col grow"><b>{b.service?.name} · {b.service?.duration_min} דק׳</b><small>{instructors.get(b.instructor_id)?.name ?? "מדריך"}</small></span>
              <Pill kind={STATUS[b.status].kind}>{STATUS[b.status].label}</Pill>
            </div>
          ))
        )}
      </div>

      {past.length > 0 ? (
        <>
          <div className="sec-h"><h2>היסטוריה</h2></div>
          <div className="surf list">
            {past.slice(0, 20).map((b) => (
              <div key={b.id} className="li" style={{ alignItems: "flex-start" }}>
                <span className="tm num">{fmtTime(b.starts_at)}<small>{fmtDate(b.starts_at)}</small></span>
                <span className="col grow">
                  <b>{b.service?.name}</b>
                  <small>{instructors.get(b.instructor_id)?.name ?? "מדריך"}</small>
                  {b.lesson_report ? <small style={{ color: "var(--ink)" }}><b style={{ fontSize: 13, color: "var(--w2)" }}>סיכום: </b>{b.lesson_report}</small> : null}
                </span>
                <Pill kind={STATUS[b.status].kind}>{STATUS[b.status].label}</Pill>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {credits.length > 0 ? (
        <>
          <div className="sec-h"><h2>כרטיסיות</h2></div>
          <div className="surf list">
            {credits.map((c) => {
              const expired = c.expires_at ? new Date(c.expires_at) <= now : false;
              return (
                <div key={c.id} className="li">
                  <Vessel level={Math.round(((c.lessons_total - c.lessons_used) / c.lessons_total) * 100)} size="xs" label={`נותרו ${c.lessons_total - c.lessons_used} מתוך ${c.lessons_total}`} />
                  <span className="col grow">
                    <b className="num">{c.lessons_total - c.lessons_used} מתוך {c.lessons_total} שיעורים</b>
                    <small>נרכשה {fmtDate(c.created_at)}{c.expires_at ? ` · בתוקף עד ${fmtDate(c.expires_at)}` : ""}</small>
                  </span>
                  {expired ? <Pill kind="done">פגה</Pill> : c.paid ? <Pill kind="ok">שולם</Pill> : <Pill kind="wait">ממתין לתשלום</Pill>}
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      <details className="surf">
        <summary>עריכת פרטים <Icon name="pen" small /></summary>
        <div className="pad">
          <KidForm initial={{ ...kid, allergies: medical.allergies, medical_notes: medical.medical_notes }} />
        </div>
      </details>

      <Guardians studentId={kid.id} kidName={kid.first_name} guardians={guardians} isOwner={isOwner} />

      {ok && kid.health_signed_at ? (
        <p className="hint center" style={{ margin: 0 }}>
          הצהרת בריאות נחתמה ב־{fmtDate(kid.health_signed_at)} על ידי {kid.health_signed_by}.{" "}
          <Link className="link" href={`/kids/${kid.id}/health`}>חידוש הצהרה</Link>
        </p>
      ) : null}

      {isOwner ? (
      <>
      <div className="row" style={{ justifyContent: "center" }}>
        <ConfirmAction
          action={setKidActive}
          fields={{ id: kid.id, active: "false" }}
          label={`הסרת ${kid.first_name} מהחשבון`}
          question={`להסיר את ${kid.first_name}? שיעורים עתידיים לא יבוטלו אוטומטית.`}
          confirmLabel="כן, להסיר"
        />
      </div>
      <p className="hint center" style={{ marginTop: -8 }}>ההיסטוריה נשמרת. אפשר להחזיר בפנייה לבית הספר.</p>
      </>
      ) : null}
    </Shell>
  );
}
