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
import { getBookings, getInstructorNames, getMyKids, type BookingRow, type Kid } from "../data";

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
            <LessonRow key={b.id} b={b} kid={kidOf.get(b.student_id)} instructor={instructors.get(b.instructor_id)?.name} hours={settings.cancellation_hours} now={now} />
          ))
        )}
      </div>

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

function LessonRow({ b, kid, instructor, hours, now, past }: { b: BookingRow; kid?: Kid; instructor?: string; hours: number; now: Date; past?: boolean }) {
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
      </span>
    </div>
  );
}
