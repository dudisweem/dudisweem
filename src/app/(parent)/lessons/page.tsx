import type { Metadata } from "next";
import Link from "next/link";
import { Shell, Head } from "@/ui/Shell";
import { requireRole, getSettings } from "@/lib/auth";
import { canParentCancel, fmtDate, fmtMoney, fmtShortDay, fmtTime } from "@/domain/format";
import { PAYMENT_LABEL, STATUS } from "@/domain/labels";
import { Pill } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import { ConfirmAction } from "@/ui/parent/ConfirmAction";
import { cancelBooking } from "../actions";
import { cancelSeriesRest, leaveWaitlist } from "./actions";
import { getBookings, getInstructorNames, getMyKids, type BookingRow, type Kid } from "../data";
import { createClient } from "@/lib/supabase/server";
import { fmtDayLabel } from "@/domain/format";

type WaitRow = { id: string; student_id: string; service_id: string; day: string; from_time: string | null; to_time: string | null; status: "waiting" | "notified"; service: { name: string } | null };

export const metadata: Metadata = { title: "השיעורים שלנו" };

export default async function LessonsPage({ searchParams }: PageProps<"/lessons">) {
  const sp = await searchParams;
  const me = await requireRole("parent", "admin", "instructor");
  const [settings, kids, instructors] = await Promise.all([getSettings(), getMyKids(me.id, true), getInstructorNames()]);
  const kidFilter = typeof sp.kid === "string" && kids.some((k) => k.id === sp.kid) ? sp.kid : null;
  const all = await getBookings(kids.map((k) => k.id));
  const bookings = kidFilter ? all.filter((b) => b.student_id === kidFilter) : all;
  const now = new Date();
  const upcoming = bookings.filter((b) => new Date(b.starts_at) > now && (b.status === "pending" || b.status === "approved"));
  const past = bookings.filter((b) => !upcoming.includes(b)).reverse();
  const kidOf = new Map(kids.map((k) => [k.id, k]));
  const supabase = await createClient();
  const { data: wlData } = kids.length
    ? await supabase
        .from("waitlist")
        .select("id, student_id, service_id, day, from_time, to_time, status, service:services(name)")
        .in("student_id", kids.map((k) => k.id))
        .in("status", ["waiting", "notified"])
        .order("day")
    : { data: [] };
  const waits = ((wlData ?? []) as unknown as WaitRow[]).filter((w) => !kidFilter || w.student_id === kidFilter);
  // first upcoming lesson of each series, so "cancel the rest" shows once per series
  const seriesHead = new Set<string>();
  const seenSeries = new Set<string>();
  for (const b of upcoming) {
    if (b.series_id && !seenSeries.has(b.series_id)) {
      seenSeries.add(b.series_id);
      seriesHead.add(b.id);
    }
  }

  return (
    <Shell
      roles={["parent", "admin", "instructor"]}
      head={
        <Head kicker="כל השיעורים במקום אחד" title="השיעורים שלנו">
          <div className="facts">
            <span><Icon name="cal" small />{upcoming.length} קרובים</span>
            <span><Icon name="clock" small />ביטול עד {settings.cancellation_hours} שעות לפני</span>
          </div>
        </Head>
      }
    >
      {kids.length > 1 ? (
        <nav className="subnav" aria-label="סינון לפי ילד">
          <Link href="/lessons" aria-current={!kidFilter ? "page" : undefined}>כולם</Link>
          {kids.filter((k) => k.active).map((k) => (
            <Link key={k.id} href={`/lessons?kid=${k.id}`} aria-current={kidFilter === k.id ? "page" : undefined}>
              <span className="dot-c" style={{ background: k.color }} />
              {k.first_name}
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="sec-h">
        <h2>קרובים</h2>
        <Link href="/book">+ הזמנה</Link>
      </div>
      <div className="surf list">
        {upcoming.length === 0 ? (
          <div className="empty">
            <Icon name="cal" />
            <div>אין שיעורים קרובים</div>
            <Link className="btn solid sm" href="/book"><Icon name="plus" />הזמנת שיעור</Link>
          </div>
        ) : (
          upcoming.map((b) => (
            <LessonRow key={b.id} b={b} kid={kidOf.get(b.student_id)} instructor={instructors.get(b.instructor_id)?.name} hours={settings.cancellation_hours} now={now} seriesHead={seriesHead.has(b.id)} />
          ))
        )}
      </div>

      {waits.length > 0 ? (
        <>
          <div className="sec-h"><h2>רשימת המתנה</h2></div>
          <div className="surf list">
            {waits.map((w) => {
              const kid = kidOf.get(w.student_id);
              const window = w.from_time || w.to_time ? ` · ${w.from_time?.slice(0, 5) ?? ""}–${w.to_time?.slice(0, 5) ?? ""}` : "";
              return (
                <div key={w.id} className="lessonrow">
                  <span className="tm num">{fmtDayLabel(w.day).split(".").slice(0, 2).join(".")}<small>{fmtDayLabel(w.day)}</small></span>
                  <span className="col">
                    <b>{kid?.first_name} · {w.service?.name}</b>
                    <small>{w.status === "notified" ? "התפנה מקום! מי שמזמין ראשון מקבל." : `ממתינים למקום פנוי${window}`}</small>
                  </span>
                  <span className="acts">
                    {w.status === "notified" ? (
                      <>
                        <Pill kind="free">התפנה מקום</Pill>
                        <Link className="btn primary sm" href={`/book?kid=${w.student_id}&service=${w.service_id}&day=${w.day}`}>להזמנה</Link>
                      </>
                    ) : (
                      <Pill kind="wait">ממתין</Pill>
                    )}
                    <ConfirmAction action={leaveWaitlist} fields={{ id: w.id }} label="יציאה מהרשימה" question="לצאת מרשימת ההמתנה?" confirmLabel="כן, לצאת" />
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {past.length > 0 ? (
        <>
          <div className="sec-h"><h2>היסטוריה</h2></div>
          <div className="surf list">
            {past.slice(0, 50).map((b) => (
              <LessonRow key={b.id} b={b} kid={kidOf.get(b.student_id)} instructor={instructors.get(b.instructor_id)?.name} hours={settings.cancellation_hours} now={now} past />
            ))}
          </div>
        </>
      ) : null}
    </Shell>
  );
}

function LessonRow({ b, kid, instructor, hours, now, past, seriesHead }: { b: BookingRow; kid?: Kid; instructor?: string; hours: number; now: Date; past?: boolean; seriesHead?: boolean }) {
  const s = STATUS[b.status];
  const start = new Date(b.starts_at);
  // pending requests can be withdrawn any time before start; approved ones respect the cancellation window
  const allowed = b.status === "pending" ? start > now : canParentCancel(start, now, hours);
  return (
    <div className="lessonrow">
      <span className="tm num">
        {fmtTime(b.starts_at)}
        <small>{fmtShortDay(b.starts_at)} {fmtDate(b.starts_at)}</small>
      </span>
      <span className="col">
        <b>
          {kid ? <span className="dot-c" style={{ background: kid.color, marginInlineEnd: 6 }} aria-hidden="true" /> : null}
          {kid?.first_name} · {b.service?.name}
        </b>
        <small>
          {[instructor ?? "מדריך", `${b.service?.duration_min ?? ""} דק׳`, b.payment_method === "card" ? "כרטיסייה" : `${PAYMENT_LABEL[b.payment_method]} · ${fmtMoney(b.price_agorot)}`].join(" · ")}
        </small>
        {past && b.lesson_report ? <small style={{ color: "var(--ink)" }}><b style={{ fontSize: 13, color: "var(--w2)" }}>סיכום: </b>{b.lesson_report}</small> : null}
      </span>
      <span className="acts">
        <Pill kind={s.kind}>{s.label}</Pill>
        {b.series_id ? <span className="pill p-done"><Icon name="refresh" />כל שבוע</span> : null}
        {!past && b.payment_method !== "card" && b.status === "approved" ? (
          b.paid ? <Pill kind="ok">שולם</Pill> : <Pill kind="wait">טרם שולם</Pill>
        ) : null}
        {!past ? (
          <ConfirmAction
            action={cancelBooking}
            fields={{ id: b.id }}
            label={b.status === "pending" ? "ביטול בקשה" : "ביטול שיעור"}
            question={`לבטל את השיעור של ${kid?.first_name ?? ""} ב־${fmtTime(b.starts_at)}?`}
            confirmLabel="כן, לבטל"
            disabled={!allowed}
            disabledReason={`פחות מ־${hours} שעות לשיעור — לביטול צרו קשר עם בית הספר`}
          />
        ) : null}
        {!past && seriesHead && b.series_id ? (
          <ConfirmAction
            action={cancelSeriesRest}
            fields={{ series: b.series_id, from: b.starts_at }}
            label="ביטול כל הסדרה מכאן"
            question={`לבטל את כל השיעורים הקבועים של ${kid?.first_name ?? ""} מ־${fmtDate(b.starts_at)} והלאה?`}
            confirmLabel="כן, לבטל הכל"
          />
        ) : null}
      </span>
    </div>
  );
}
