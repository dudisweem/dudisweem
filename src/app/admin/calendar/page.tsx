import type { Metadata } from "next";
import Link from "next/link";
import { Shell, Head } from "@/ui/Shell";
import { createClient } from "@/lib/supabase/server";
import { addDays, businessDay, dayNum, fmtDayLabel, fmtTime, localToUtc, weekStart, WEEKDAYS } from "@/domain/format";
import { STATUS } from "@/domain/labels";
import { Pill } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import { BOOKING_SELECT, kidName, type AdminBooking } from "../_lib/queries";

export const metadata: Metadata = { title: "יומן" };

const HH = 56; // px per hour

function minutesOf(iso: string) {
  const [h, m] = fmtTime(iso).split(":").map(Number);
  return h! * 60 + m!;
}
function timeToMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h! * 60 + m!;
}

export default async function CalendarPage({ searchParams }: PageProps<"/admin/calendar">) {
  const sp = await searchParams;
  const todayDay = businessDay();
  const wk = typeof sp.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? weekStart(sp.week) : weekStart(todayDay);
  const instructorFilter = typeof sp.instructor === "string" ? sp.instructor : "";
  const days = Array.from({ length: 7 }, (_, i) => addDays(wk, i));
  const from = localToUtc(wk, "00:00").toISOString();
  const to = localToUtc(addDays(wk, 7), "00:00").toISOString();

  const supabase = await createClient();
  let bq = supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .gte("starts_at", from)
    .lt("starts_at", to)
    .in("status", ["pending", "approved", "completed", "no_show", "cancelled", "declined"])
    .order("starts_at");
  if (instructorFilter) bq = bq.eq("instructor_id", instructorFilter);

  const [bRes, staffRes, whRes, offRes] = await Promise.all([
    bq,
    supabase.from("profiles").select("id, full_name, color").in("role", ["admin", "instructor"]).eq("active", true).order("full_name"),
    supabase.from("working_hours").select("instructor_id, weekday, start_time, end_time"),
    supabase.from("time_off").select("id, instructor_id, starts_at, ends_at, reason").lt("starts_at", to).gt("ends_at", from),
  ]);
  const showCancelled = sp.cancelled === "1";
  const bookings = ((bRes.data ?? []) as unknown as AdminBooking[]).filter(
    (b) => showCancelled || !["cancelled", "declined"].includes(b.status),
  );
  const staff = staffRes.data ?? [];
  const wh = (whRes.data ?? []).filter((w) => !instructorFilter || w.instructor_id === instructorFilter);
  const off = (offRes.data ?? []).filter((o) => !instructorFilter || !o.instructor_id || o.instructor_id === instructorFilter);

  // visible hour range: working hours and bookings, default 7..21
  let startH = 7;
  let endH = 21;
  for (const w of wh) {
    startH = Math.min(startH, Math.floor(timeToMin(w.start_time) / 60));
    endH = Math.max(endH, Math.ceil(timeToMin(w.end_time) / 60));
  }
  for (const b of bookings) {
    startH = Math.min(startH, Math.floor(minutesOf(b.starts_at) / 60));
    endH = Math.max(endH, Math.ceil(minutesOf(b.ends_at) / 60));
  }
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);
  const top = (min: number) => ((min - startH * 60) / 60) * HH;

  const nowMin = minutesOf(new Date().toISOString());
  const qs = (o: Record<string, string>) => {
    const p = new URLSearchParams({ week: wk, ...(instructorFilter ? { instructor: instructorFilter } : {}), ...(showCancelled ? { cancelled: "1" } : {}), ...o });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/admin/calendar?${p.toString()}`;
  };

  return (
    <Shell
      roles={["admin"]}
      head={
        <Head kicker="שבוע" title={`${fmtDayLabel(days[0]!)} – ${fmtDayLabel(days[6]!)}`}>
          <div className="facts">
            <span><Icon name="cal" small />{bookings.filter((b) => ["pending", "approved"].includes(b.status)).length} שיעורים פעילים</span>
            <span><Icon name="clock" small />{bookings.filter((b) => b.status === "pending").length} ממתינים</span>
          </div>
        </Head>
      }
    >
      <div className="calbar">
        <div className="week-nav">
          <Link className="iconbtn" href={qs({ week: addDays(wk, 7) })} aria-label="השבוע הבא"><Icon name="right" /></Link>
          <Link className="btn quiet sm" href={qs({ week: weekStart(todayDay) })}>השבוע</Link>
          <Link className="iconbtn" href={qs({ week: addDays(wk, -7) })} aria-label="השבוע הקודם"><Icon name="left" /></Link>
        </div>
        <div className="chips" role="group" aria-label="סינון מדריך">
          <Link className="chip" aria-pressed={!instructorFilter} href={qs({ instructor: "" })}>כולם</Link>
          {staff.map((s) => (
            <Link key={s.id} className="chip" aria-pressed={instructorFilter === s.id} href={qs({ instructor: s.id })}>
              <span className="dot-c" style={{ background: s.color }} />
              {s.full_name || "ללא שם"}
            </Link>
          ))}
        </div>
        <div className="acts-row">
          <Link className="btn ghost sm" href={qs({ cancelled: showCancelled ? "" : "1" })}>
            {showCancelled ? "הסתרת מבוטלים" : "הצגת מבוטלים"}
          </Link>
          <Link className="btn primary sm" href="/admin/bookings/new"><Icon name="plus" />שיעור חדש</Link>
        </div>
      </div>

      <div className="scroll-x">
        <div
          className="cal"
          style={{
            ["--cols" as string]: 7,
            ["--hh" as string]: `${HH}px`,
            ["--cw" as string]: "118px",
            gridTemplateRows: `auto repeat(${hours.length}, ${HH}px)`,
          }}
          role="grid"
          aria-label="יומן שבועי"
        >
          {hours.map((h, i) => (
            <div key={h} className="hr num" style={{ gridColumn: 1, gridRow: i + 2 }}>{String(h).padStart(2, "0")}:00</div>
          ))}
          {days.map((d, idx) => {
            const isToday = d === todayDay;
            const wd = idx; // week starts Sunday so index == weekday
            const dayWh = wh.filter((w) => w.weekday === wd);
            const dStart = localToUtc(d, "00:00").getTime();
            const dEnd = localToUtc(addDays(d, 1), "00:00").getTime();
            const dayOff = off.filter((o) => new Date(o.starts_at).getTime() < dEnd && new Date(o.ends_at).getTime() > dStart);
            const dayBookings = bookings.filter((b) => businessDay(b.starts_at) === d);
            // side-by-side columns for overlaps
            const lanes: AdminBooking[][] = [];
            const laneOf = new Map<string, number>();
            for (const b of dayBookings) {
              let li = lanes.findIndex((lane) => lane.every((x) => x.ends_at <= b.starts_at || x.starts_at >= b.ends_at));
              if (li === -1) { lanes.push([]); li = lanes.length - 1; }
              lanes[li]!.push(b);
              laneOf.set(b.id, li);
            }
            const laneCount = Math.max(1, lanes.length);
            return (
              <div key={d} style={{ display: "contents" }}>
                <div className={`ch ${isToday ? "today" : ""}`} style={{ gridColumn: idx + 2, gridRow: 1 }}>
                  יום {WEEKDAYS[idx]}
                  <b className="num">{dayNum(d)}</b>
                </div>
                <div className={`colday ${isToday ? "today" : ""}`} style={{ gridColumn: idx + 2 }}>
                  {dayWh.map((w, i) => (
                    <div key={i} className="wh" style={{ top: top(timeToMin(w.start_time)), height: ((timeToMin(w.end_time) - timeToMin(w.start_time)) / 60) * HH }} />
                  ))}
                  {dayOff.map((o) => {
                    const s = Math.max(new Date(o.starts_at).getTime(), dStart);
                    const e = Math.min(new Date(o.ends_at).getTime(), dEnd);
                    const sMin = s === dStart ? startH * 60 : minutesOf(new Date(s).toISOString());
                    const eMin = e === dEnd ? endH * 60 : minutesOf(new Date(e).toISOString());
                    return (
                      <div key={o.id} className="off" style={{ top: top(sMin), height: Math.max(18, ((eMin - sMin) / 60) * HH) }}>
                        {o.reason || "חסום"}
                      </div>
                    );
                  })}
                  {dayBookings.map((b) => {
                    const s = minutesOf(b.starts_at);
                    const e = minutesOf(b.ends_at);
                    const lane = laneOf.get(b.id) ?? 0;
                    const st = STATUS[b.status];
                    const cls = b.status === "pending" ? "wait" : b.status === "approved" ? "ok" : st.kind === "bad" ? "bad" : "done";
                    return (
                      <Link
                        key={b.id}
                        href={`/admin/bookings/${b.id}`}
                        className={`ev ${cls}`}
                        style={{
                          top: top(s) + 1,
                          height: Math.max(26, ((e - s) / 60) * HH - 2),
                          insetInlineStart: `calc(${(lane / laneCount) * 100}% + 3px)`,
                          insetInlineEnd: "auto",
                          width: `calc(${100 / laneCount}% - 6px)`,
                        }}
                        aria-label={`${fmtTime(b.starts_at)} ${kidName(b)} ${b.service?.name ?? ""} ${st.label}`}
                      >
                        <span className="t num">{fmtTime(b.starts_at)}</span>
                        <b>
                          <span className="d" style={{ background: b.instructor?.color ?? "#1D6E9E" }} />
                          {kidName(b)}
                        </b>
                        <span>{b.service?.name}</span>
                        {b.status === "pending" ? <span>ממתין</span> : null}
                      </Link>
                    );
                  })}
                  {isToday && nowMin >= startH * 60 && nowMin <= endH * 60 ? <div className="calnow" style={{ top: top(nowMin) }} /> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="legend" aria-label="מקרא">
        <Pill kind="ok">מאושר</Pill>
        <Pill kind="wait">ממתין לאישור</Pill>
        <Pill kind="done">התקיים / בוטל</Pill>
        <Pill kind="bad">לא הגיע / נדחה</Pill>
        <Pill kind="free">שעות עבודה</Pill>
      </div>
    </Shell>
  );
}
