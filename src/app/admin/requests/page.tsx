import type { Metadata } from "next";
import Link from "next/link";
import { Shell, Head } from "@/ui/Shell";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { fmtDate, fmtMoney, fmtTime, fmtWeekday, healthValid } from "@/domain/format";
import { PAYMENT_LABEL } from "@/domain/labels";
import { Pill, Empty, Avatar } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import { SubmitButton } from "@/ui/SubmitButton";
import { BOOKING_SELECT, kidName, type AdminBooking } from "../_lib/queries";
import { Flash } from "../_lib/Flash";
import { adminLeaveWaitlist, approveSeries, setStatus } from "../actions";
import { fmtDayLabel } from "@/domain/format";

type WaitRow = {
  id: string;
  day: string;
  from_time: string | null;
  to_time: string | null;
  status: "waiting" | "notified";
  created_at: string;
  student: { first_name: string; last_name: string; parent: { full_name: string; phone: string } | null } | null;
  service: { name: string } | null;
  instructor: { full_name: string } | null;
};

export const metadata: Metadata = { title: "בקשות" };

export default async function RequestsPage({ searchParams }: PageProps<"/admin/requests">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const settings = await getSettings();
  const nowIso = new Date().toISOString();

  const { data } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("status", "pending")
    .gte("starts_at", nowIso)
    .order("starts_at");
  const pending = (data ?? []) as unknown as AdminBooking[];
  // weekly series: count pending lessons per series; the first one gets an "approve all" button
  const seriesCount = new Map<string, number>();
  const seriesFirst = new Set<string>(); // booking ids that carry the series button
  for (const b of pending) {
    if (!b.series_id) continue;
    if (!seriesCount.has(b.series_id)) seriesFirst.add(b.id);
    seriesCount.set(b.series_id, (seriesCount.get(b.series_id) ?? 0) + 1);
  }

  const { data: wlData } = await supabase
    .from("waitlist")
    .select(
      "id, day, from_time, to_time, status, created_at, student:students!waitlist_student_id_fkey ( first_name, last_name, parent:profiles!students_parent_id_fkey ( full_name, phone ) ), service:services!waitlist_service_id_fkey ( name ), instructor:profiles!waitlist_instructor_id_fkey ( full_name )",
    )
    .in("status", ["waiting", "notified"])
    .order("day")
    .order("created_at");
  const waits = (wlData ?? []) as unknown as WaitRow[];

  // conflicts: any other active booking of the same instructor overlapping in time (other service or start)
  let others: { id: string; instructor_id: string; starts_at: string; ends_at: string; service_id: string; status: string }[] = [];
  if (pending.length) {
    const minStart = pending[0]!.starts_at;
    const maxEnd = pending.reduce((m, b) => (b.ends_at > m ? b.ends_at : m), pending[0]!.ends_at);
    const { data: o } = await supabase
      .from("bookings")
      .select("id, instructor_id, starts_at, ends_at, service_id, status")
      .in("status", ["pending", "approved"])
      .lt("starts_at", maxEnd)
      .gt("ends_at", minStart);
    others = o ?? [];
  }
  function conflictsOf(b: AdminBooking) {
    return others.filter(
      (o) =>
        o.id !== b.id &&
        o.instructor_id === b.instructor?.id &&
        o.starts_at < b.ends_at &&
        o.ends_at > b.starts_at &&
        !(o.service_id === b.service?.id && o.starts_at === b.starts_at),
    );
  }
  function sameSlotCount(b: AdminBooking) {
    return others.filter((o) => o.instructor_id === b.instructor?.id && o.service_id === b.service?.id && o.starts_at === b.starts_at).length;
  }

  return (
    <Shell
      roles={["admin"]}
      head={
        <Head kicker="מחכות להחלטה שלך" title="בקשות לשיעורים">
          <div className="facts">
            <span><Icon name="inbox" small />{pending.length} ממתינות</span>
            <span><Icon name="flag" small />{settings.require_approval ? "כל בקשה דורשת אישור" : "אישור אוטומטי פעיל"}</span>
          </div>
        </Head>
      }
    >
      <Flash sp={sp} />
      {pending.length === 0 ? (
        <div className="surf">
          <Empty icon="check">אין בקשות ממתינות. הכל מטופל.</Empty>
        </div>
      ) : (
        <div className="reqs">
          {pending.map((b) => {
            const conflicts = conflictsOf(b);
            const count = sameSlotCount(b);
            const over = b.service ? count > b.service.capacity : false;
            const health = healthValid(b.student?.health_signed_at ?? null, settings.health_validity_months, settings.health_required);
            return (
              <article key={b.id} className="surf req">
                <div className="row">
                  <Avatar name={b.student?.first_name ?? "?"} color={b.student?.color ?? "#5DB4DA"} size="l" />
                  <div className="col grow">
                    <b>{kidName(b)}</b>
                    <small>
                      {b.service?.name} · {b.instructor?.full_name}
                    </small>
                  </div>
                  <span className="tm num">
                    {fmtTime(b.starts_at)}
                    <small>{fmtWeekday(b.starts_at)} {fmtDate(b.starts_at)}</small>
                  </span>
                </div>
                <div className="kv">
                  <span><Icon name="user" small />{b.student?.parent?.full_name || "—"}</span>
                  {b.student?.parent?.phone ? (
                    <span><Icon name="send" small /><a href={`tel:${b.student.parent.phone}`} dir="ltr">{b.student.parent.phone}</a></span>
                  ) : null}
                  <span><Icon name="wallet" small />{PAYMENT_LABEL[b.payment_method]} · {fmtMoney(b.price_agorot)}</span>
                  <span>בקשה #{b.number}</span>
                </div>
                {b.parent_note ? <p style={{ margin: 0, fontSize: 14 }}>״{b.parent_note}״</p> : null}
                <div className="acts-row">
                  {health ? <Pill kind="ok">הצהרת בריאות בתוקף</Pill> : <Pill kind="bad">אין הצהרת בריאות בתוקף</Pill>}
                  {b.service && b.service.capacity > 1 ? (
                    <Pill kind="free">{count} מתוך {b.service.capacity} בקבוצה</Pill>
                  ) : null}
                  {b.series_id ? <span className="pill p-done"><Icon name="refresh" />סדרה שבועית</span> : null}
                </div>
                {b.series_id && seriesFirst.has(b.id) && (seriesCount.get(b.series_id) ?? 0) > 1 ? (
                  <form action={approveSeries}>
                    <input type="hidden" name="series" value={b.series_id} />
                    <input type="hidden" name="back" value="/admin/requests" />
                    <SubmitButton variant="primary" sm pendingLabel="מאשרים…">
                      <Icon name="check" />אישור כל הסדרה ({seriesCount.get(b.series_id)} שיעורים)
                    </SubmitButton>
                  </form>
                ) : null}
                {conflicts.length || over ? (
                  <div className="block">
                    <Icon name="alert" small />
                    {over
                      ? "יותר בקשות מהקיבולת בשיעור הזה."
                      : `חפיפה עם ${conflicts.length} שיעור/ים אחרים של ${b.instructor?.full_name} בזמן הזה.`}
                  </div>
                ) : null}
                <form action={setStatus} className="stack-s">
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="back" value="/admin/requests" />
                  <label className="hint" htmlFor={`note-${b.id}`}>הערה (תישמר בשיעור)</label>
                  <input className="inp sm" id={`note-${b.id}`} name="note" maxLength={300} placeholder="לא חובה" />
                  <div className="acts">
                    <SubmitButton name="status" value="approved" variant="solid" sm pendingLabel="מאשרים…">
                      <Icon name="check" />אישור
                    </SubmitButton>
                    <SubmitButton name="status" value="declined" variant="danger" sm pendingLabel="דוחים…">
                      <Icon name="x" />דחייה
                    </SubmitButton>
                    <Link href={`/admin/bookings/${b.id}`} className="btn quiet sm">פרטים</Link>
                  </div>
                </form>
              </article>
            );
          })}
        </div>
      )}

      <div className="sec-h"><h2>רשימת המתנה</h2><span className="hint">{waits.length} ממתינים</span></div>
      {waits.length === 0 ? (
        <div className="surf"><Empty icon="flag">אין ממתינים כרגע.</Empty></div>
      ) : (
        <div className="surf list">
          {waits.map((w) => (
            <div key={w.id} className="li">
              <span className="tm num">{fmtDayLabel(w.day).split(".").slice(0, 2).join(".")}<small>{fmtWeekday(`${w.day}T12:00:00Z`)}</small></span>
              <span className="col grow">
                <b>{w.student ? `${w.student.first_name} ${w.student.last_name}`.trim() : "—"} · {w.service?.name}</b>
                <small>
                  {[
                    w.instructor?.full_name ? `מדריך: ${w.instructor.full_name}` : "כל מדריך",
                    w.from_time || w.to_time ? `${w.from_time?.slice(0, 5) ?? ""}–${w.to_time?.slice(0, 5) ?? ""}` : "כל שעה",
                    w.student?.parent?.full_name,
                  ].filter(Boolean).join(" · ")}
                  {w.student?.parent?.phone ? <> · <a href={`tel:${w.student.parent.phone}`} dir="ltr">{w.student.parent.phone}</a></> : null}
                </small>
              </span>
              {w.status === "notified" ? <Pill kind="free">קיבלו הודעה</Pill> : <Pill kind="wait">ממתין</Pill>}
              <form action={adminLeaveWaitlist}>
                <input type="hidden" name="id" value={w.id} />
                <input type="hidden" name="back" value="/admin/requests" />
                <SubmitButton variant="quiet" sm pendingLabel="מסירים…">הסרה</SubmitButton>
              </form>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
