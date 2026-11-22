import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "@/ui/Shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, businessDay, fmtDayLabel, fmtTime, localToUtc, fmtWeekday } from "@/domain/format";
import { LEVEL_LABEL, STATUS, type BookingStatus } from "@/domain/labels";
import { Avatar, Pill } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import { LessonReport } from "@/ui/parent/LessonReport";
import { ProgressRecorder } from "@/ui/ProgressRecorder";
import { loadProgressMany } from "@/lib/progress";
import "../(parent)/parent.css";
import "./staff.css";

export const metadata: Metadata = { title: "יום העבודה" };

type Row = {
  booking_id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  service_name: string;
  student_name: string;
  student_level: string;
  allergies: string;
  lesson_report: string;
};

export default async function WorkdayPage({ searchParams }: PageProps<"/workday">) {
  const sp = await searchParams;
  const me = await requireRole("instructor", "admin");
  const today = businessDay();
  const day = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : today;
  const supabase = await createClient();
  const [{ data }, { data: studs }] = await Promise.all([
    supabase.rpc("instructor_day", { p_day: day }),
    supabase.rpc("instructor_day_students", { p_day: day }),
  ]);
  const rows = (data ?? []) as Row[];
  const studentOf = new Map(((studs ?? []) as { booking_id: string; student_id: string; first_name: string }[]).map((s) => [s.booking_id, s]));
  const { byStudent } = await loadProgressMany([...new Set([...studentOf.values()].map((s) => s.student_id))]);
  const now = new Date();
  const open = rows.filter((r) => r.status === "approved" && new Date(r.starts_at) <= now).length;
  const dayLabel = day === today ? "היום" : day === addDays(today, 1) ? "מחר" : day === addDays(today, -1) ? "אתמול" : fmtWeekday(localToUtc(day, "12:00"));

  return (
    <Shell
      roles={["instructor", "admin"]}
      head={
        <>
          <span className="k">{dayLabel} · {fmtDayLabel(day)}</span>
          <h1>יום העבודה של {me.full_name.split(" ")[0] || "המדריך"}</h1>
          <div className="facts" style={{ alignItems: "center" }}>
            <span><Icon name="cal" small />{rows.length} שיעורים</span>
            {open ? <span><Icon name="pen" small />{open} ממתינים לדיווח</span> : null}
            <span className="wd-nav">
              <Link href={`/workday?day=${addDays(day, -1)}`} aria-label="יום קודם"><Icon name="right" /></Link>
              {day !== today ? <Link href="/workday" style={{ minWidth: 0, padding: "0 12px", fontWeight: 700 }}>היום</Link> : null}
              <Link href={`/workday?day=${addDays(day, 1)}`} aria-label="יום הבא"><Icon name="left" /></Link>
              <Link href="/pool" style={{ minWidth: 0, padding: "0 12px", fontWeight: 700, gap: 6, display: "flex", alignItems: "center" }}><Icon name="waves" small />מסך בריכה</Link>
              <Link href="/workday/availability" style={{ minWidth: 0, padding: "0 12px", fontWeight: 700, gap: 6, display: "flex", alignItems: "center" }}><Icon name="clock" small />הזמינות שלי</Link>
            </span>
          </div>
        </>
      }
    >
      <span className="private"><Icon name="lock" small />מוצגים רק השיעורים שלך. אין כאן מידע כספי.</span>
      {rows.length === 0 ? (
        <div className="surf empty"><Icon name="waves" /><div>אין שיעורים מאושרים ביום הזה.</div></div>
      ) : (
        rows.map((r) => {
          const start = new Date(r.starts_at);
          const end = new Date(r.ends_at);
          const live = start <= now && end > now;
          const missing = r.status === "approved" && end <= now;
          const pill =
            r.status !== "approved" ? (
              <Pill kind={STATUS[r.status].kind}>{STATUS[r.status].label}</Pill>
            ) : live ? (
              <Pill kind="live">במים עכשיו</Pill>
            ) : missing ? (
              <Pill kind="wait">הסתיים · חסר דיווח</Pill>
            ) : (
              <Pill kind="ok">מאושר</Pill>
            );
          const mins = Math.round((end.getTime() - start.getTime()) / 60000);
          return (
            <div key={r.booking_id} className={`surf lesson${missing ? " miss" : ""}`}>
              <div className="row">
                <span className="tm num">{fmtTime(r.starts_at)}<small>{mins} דק׳</small></span>
                <Avatar name={r.student_name} color="#1D6E9E" size="l" />
                <span className="col grow">
                  <b>{r.student_name}</b>
                  <small>{r.service_name} · {LEVEL_LABEL[r.student_level] ?? r.student_level}</small>
                </span>
                {pill}
              </div>
              {r.allergies ? (
                <span className="block"><Icon name="alert" small />אלרגיות: {r.allergies}</span>
              ) : null}
              <LessonReport id={r.booking_id} report={r.lesson_report} started={start <= now} status={r.status} />
              {start <= now && studentOf.get(r.booking_id) ? (
                <ProgressRecorder
                  studentId={studentOf.get(r.booking_id)!.student_id}
                  firstName={studentOf.get(r.booking_id)!.first_name}
                  summary={byStudent.get(studentOf.get(r.booking_id)!.student_id) ?? []}
                />
              ) : null}
            </div>
          );
        })
      )}
    </Shell>
  );
}
