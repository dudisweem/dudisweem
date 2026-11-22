import type { Metadata } from "next";
import Link from "next/link";
import { Shell, Head } from "@/ui/Shell";
import { createClient } from "@/lib/supabase/server";
import { getSettings, requireRole } from "@/lib/auth";
import { fmtDayLabel, fmtTime, fmtWeekday, healthValid } from "@/domain/format";
import { StatusPill, Empty, Avatar } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import { BOOKING_SELECT, kidName, type AdminBooking } from "./_lib/queries";
import { dayRangeUtc, nowMs, today } from "./_lib/util";

export const metadata: Metadata = { title: "היום" };

export default async function AdminToday() {
  const me = await requireRole("admin");
  const supabase = await createClient();
  const settings = await getSettings();
  const day = today();
  const { from, to } = dayRangeUtc(day);
  const nowIso = new Date().toISOString();

  const [todayRes, pendingRes, studentsRes, unpaidRes] = await Promise.all([
    supabase
      .from("bookings")
      .select(BOOKING_SELECT)
      .gte("starts_at", from)
      .lt("starts_at", to)
      .in("status", ["pending", "approved", "completed", "no_show"])
      .order("starts_at"),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending").gte("starts_at", nowIso),
    supabase.from("students").select("id, health_signed_at").eq("active", true),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("status", ["approved", "completed"])
      .eq("paid", false)
      .neq("payment_method", "card")
      .lt("starts_at", nowIso),
  ]);

  const lessons = (todayRes.data ?? []) as unknown as AdminBooking[];
  const pending = pendingRes.count ?? 0;
  const missingHealth = (studentsRes.data ?? []).filter(
    (s) => !healthValid(s.health_signed_at, settings.health_validity_months, settings.health_required),
  ).length;
  const unpaid = unpaidRes.count ?? 0;
  const now = nowMs();
  const nextIdx = lessons.findIndex((l) => new Date(l.starts_at).getTime() > now);
  const firstName = (me.full_name || "").split(" ")[0] || "דודי";

  return (
    <Shell
      roles={["admin"]}
      head={
        <Head kicker={`יום ${fmtWeekday(new Date())}, ${fmtDayLabel(day)}`} title={`בוקר טוב, ${firstName}`}>
          <div className="facts">
            <span><Icon name="waves" small />{lessons.length} שיעורים היום</span>
            {pending ? <span><Icon name="inbox" small />{pending} בקשות ממתינות</span> : null}
            {!settings.booking_open ? <span><Icon name="lock" small />ההרשמה סגורה להורים</span> : null}
          </div>
        </Head>
      }
    >
      <div className="gauges" role="list" aria-label="מדדים">
        <Link href="/admin/requests" className={`gauge ${pending ? "warn" : ""}`} role="listitem">
          <div className="g-top"><span className="g-n num">{pending}</span><Icon name="inbox" /></div>
          <span className="g-l">בקשות ממתינות לאישור</span>
        </Link>
        <Link href="/admin/calendar" className="gauge" role="listitem">
          <div className="g-top"><span className="g-n num">{lessons.length}</span><Icon name="cal" /></div>
          <span className="g-l">שיעורים היום</span>
        </Link>
        <Link href="/admin/students?filter=health" className={`gauge ${missingHealth ? "warn" : ""}`} role="listitem">
          <div className="g-top"><span className="g-n num">{missingHealth}</span><Icon name="heart" /></div>
          <span className="g-l">ילדים בלי הצהרת בריאות בתוקף</span>
        </Link>
        <Link href="/admin/payments?filter=unpaid" className={`gauge ${unpaid ? "warn" : ""}`} role="listitem">
          <div className="g-top"><span className="g-n num">{unpaid}</span><Icon name="wallet" /></div>
          <span className="g-l">שיעורים שעוד לא שולמו</span>
        </Link>
      </div>

      <div className="two">
        <section className="stack-s" aria-labelledby="today-h">
          <div className="sec-h">
            <h2 id="today-h">המים היום</h2>
            <Link href="/admin/calendar">ליומן המלא</Link>
          </div>
          <div className="surf list">
            {lessons.length === 0 ? (
              <Empty icon="waves">אין שיעורים היום. אפשר לפרסם שעות ב<Link className="link" href="/admin/schedule">שעות עבודה</Link>.</Empty>
            ) : (
              lessons.map((l, i) => {
                const past = new Date(l.ends_at).getTime() < now;
                const live = new Date(l.starts_at).getTime() <= now && !past;
                return (
                  <div key={l.id} style={{ display: "contents" }}>
                    {i === nextIdx ? (
                      <div className="nowline" aria-hidden="true"><span>עכשיו {fmtTime(new Date())}</span></div>
                    ) : null}
                    <Link href={`/admin/bookings/${l.id}`} className={`trow ${live ? "now" : ""} ${past ? "past" : ""}`}>
                      <span className="tm num">{fmtTime(l.starts_at)}<small>{fmtTime(l.ends_at)}</small></span>
                      <span className="col">
                        <b>{kidName(l)}</b>
                        <small>{l.service?.name}</small>
                      </span>
                      <span className="meta">{l.instructor?.full_name}</span>
                      <span className="meta">{l.student?.parent?.full_name}</span>
                      {live ? <span className="pill p-live"><Icon name="waves" />במים עכשיו</span> : <StatusPill status={l.status} />}
                    </Link>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <aside className="stack-s" aria-labelledby="quick-h">
          <div className="sec-h"><h2 id="quick-h">פעולות מהירות</h2></div>
          <div className="quick">
            <Link href="/admin/bookings/new" className="btn primary"><Icon name="plus" />שיעור חדש</Link>
            <Link href="/admin/requests" className="btn solid"><Icon name="inbox" />בקשות</Link>
            <Link href="/admin/schedule" className="btn ghost"><Icon name="clock" />שעות עבודה</Link>
            <Link href="/admin/settings" className="btn ghost"><Icon name="pen" />הגדרות</Link>
          </div>
          {lessons.length > 0 ? (
            <div className="surf pad stack-s">
              <b>מדריכים היום</b>
              {Array.from(new Map(lessons.filter((l) => l.instructor).map((l) => [l.instructor!.id, l.instructor!])).values()).map((ins) => (
                <div key={ins.id} className="row">
                  <Avatar name={ins.full_name} color={ins.color} />
                  <span className="grow">{ins.full_name}</span>
                  <span className="num muted">{lessons.filter((l) => l.instructor?.id === ins.id).length} שיעורים</span>
                </div>
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </Shell>
  );
}
