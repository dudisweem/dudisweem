import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "@/ui/Shell";
import { requireRole, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, businessDay, fmtDate, fmtTime, WEEKDAYS } from "@/domain/format";
import { AVAIL_ERRORS, AVAIL_OK, describeRequest, type AvailabilityKind } from "@/domain/availability";
import { Alert, Empty, Pill } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import { SubmitButton } from "@/ui/SubmitButton";
import { ConfirmButton } from "@/ui/admin/ConfirmButton";
import { addMyHours, addMyTimeOff, cancelMyRequest, removeMyHours, removeMyTimeOff } from "./actions";
import "../../(parent)/parent.css";
import "../staff.css";

export const metadata: Metadata = { title: "הזמינות שלי" };

const short = (t: string) => t.slice(0, 5);

type Req = { id: string; kind: AvailabilityKind; payload: Record<string, unknown>; status: "pending" | "approved" | "rejected"; note: string; created_at: string };

export default async function AvailabilityPage({ searchParams }: PageProps<"/workday/availability">) {
  const sp = await searchParams;
  const me = await requireRole("instructor", "admin");
  const settings = await getSettings();
  const supabase = await createClient();
  const [whRes, offRes, reqRes] = await Promise.all([
    supabase.from("working_hours").select("id, weekday, start_time, end_time").eq("instructor_id", me.id).order("weekday").order("start_time"),
    supabase.from("time_off").select("id, instructor_id, starts_at, ends_at, reason").gte("ends_at", new Date().toISOString()).order("starts_at"),
    supabase.from("availability_requests").select("id, kind, payload, status, note, created_at").eq("instructor_id", me.id).order("created_at", { ascending: false }).limit(20),
  ]);
  const wh = whRes.data ?? [];
  const allOff = offRes.data ?? [];
  const mine = allOff.filter((o) => o.instructor_id === me.id);
  const schoolWide = allOff.filter((o) => o.instructor_id === null);
  const reqs = (reqRes.data ?? []) as Req[];
  const pending = reqs.filter((r) => r.status === "pending");
  const recent = reqs.filter((r) => r.status !== "pending").slice(0, 5);
  const needsApproval = me.role !== "admin" && (settings.instructor_availability_approval ?? true);
  const today = businessDay();
  const lookup = {
    hours: new Map(wh.map((w) => [w.id, `יום ${WEEKDAYS[w.weekday]} ${short(w.start_time)}–${short(w.end_time)}`])),
    off: new Map(mine.map((o) => [o.id, `${fmtDate(o.starts_at)} ${o.reason ? `· ${o.reason}` : ""}`])),
  };
  const err = typeof sp.err === "string" ? sp.err : null;
  const ok = typeof sp.ok === "string" ? sp.ok : null;

  return (
    <Shell
      roles={["instructor", "admin"]}
      head={
        <>
          <span className="k">
            <Link href="/workday" style={{ color: "inherit" }}>יום העבודה</Link> · זמינות
          </span>
          <h1>הזמינות שלי</h1>
          <div className="facts">
            <span><Icon name="clock" small />{wh.length} טווחי שעות קבועים</span>
            <span><Icon name="flag" small />{mine.length} חסימות קרובות</span>
            {pending.length ? <span><Icon name="inbox" small />{pending.length} ממתינות לאישור</span> : null}
          </div>
        </>
      }
    >
      {err ? <Alert kind="bad">{AVAIL_ERRORS[err] ?? AVAIL_ERRORS.unknown}</Alert> : null}
      {ok ? <Alert kind="ok">{AVAIL_OK[ok] ?? "בוצע."}</Alert> : null}
      <Alert kind="info">
        {needsApproval
          ? "כל שינוי נשלח למנהל לאישור ונכנס ללוח רק אחרי האישור. הורים מזמינים רק בשעות שמופיעות כאן."
          : "שינויים נכנסים ללוח מיד. הורים מזמינים רק בשעות שמופיעות כאן."}
        {" "}אי אפשר להסיר זמן שיש בו שיעור מתוכנן.
      </Alert>

      {pending.length ? (
        <section className="surf list" aria-labelledby="pend-h">
          <div className="pad"><b id="pend-h">ממתין לאישור המנהל</b></div>
          {pending.map((r) => (
            <form key={r.id} action={cancelMyRequest} className="li">
              <input type="hidden" name="id" value={r.id} />
              <span className="col grow">
                <b>{describeRequest(r.kind, r.payload, lookup)}</b>
                <small>נשלח {fmtDate(r.created_at)} {fmtTime(r.created_at)}</small>
              </span>
              <Pill kind="wait">ממתין</Pill>
              <ConfirmButton question="לבטל את הבקשה?" confirmLabel="ביטול בקשה" variant="ghost">ביטול</ConfirmButton>
            </form>
          ))}
        </section>
      ) : null}

      <div className="two">
        <section className="surf" aria-labelledby="wh-h">
          <div className="pad" style={{ paddingBottom: 4 }}>
            <b id="wh-h">שעות קבועות בכל שבוע</b>
          </div>
          {WEEKDAYS.map((name, d) => {
            const rows = wh.filter((w) => w.weekday === d);
            return (
              <div key={d} className="wh-day">
                <h3>יום {name}</h3>
                {rows.length === 0 ? (
                  <span className="small muted">לא עובד</span>
                ) : (
                  <div className="acts-row">
                    {rows.map((w) => (
                      <form key={w.id} action={removeMyHours} className="wh-chip">
                        <input type="hidden" name="id" value={w.id} />
                        <span className="num">{short(w.start_time)}–{short(w.end_time)}</span>
                        <button type="submit" className="btn quiet sm" aria-label={`הסרת ${short(w.start_time)}–${short(w.end_time)} ביום ${name}`}>
                          <Icon name="x" small />
                        </button>
                      </form>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <form action={addMyHours} className="surf pad stack-s" aria-labelledby="add-h">
          <b id="add-h">הוספת שעות</b>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small" style={{ fontWeight: 700, marginBottom: 6 }}>בימים</legend>
            <div className="chips">
              {WEEKDAYS.map((name, d) => (
                <label key={d} className="chip" style={{ cursor: "pointer" }}>
                  <input type="checkbox" name="weekday" value={d} />
                  {name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="cols2">
            <div className="field"><label htmlFor="start">משעה</label><input className="inp num" id="start" name="start" type="time" step={300} required defaultValue="16:00" /></div>
            <div className="field"><label htmlFor="end">עד שעה</label><input className="inp num" id="end" name="end" type="time" step={300} required defaultValue="19:00" /></div>
          </div>
          <SubmitButton variant="primary" sm>
            <Icon name="plus" />
            {needsApproval ? "שליחה לאישור" : "הוספה"}
          </SubmitButton>
        </form>
      </div>

      <div className="sec-h"><h2>חופשות וחסימות שלי</h2></div>
      <div className="two">
        <div className="surf list">
          {mine.length === 0 ? <Empty icon="cal">אין חסימות קרובות.</Empty> : null}
          {mine.map((o) => (
            <form key={o.id} action={removeMyTimeOff} className="li">
              <input type="hidden" name="id" value={o.id} />
              <span className="col grow">
                <b>{o.reason || "חסום"}</b>
                <small>{fmtDate(o.starts_at)} {fmtTime(o.starts_at)} – {fmtDate(o.ends_at)} {fmtTime(o.ends_at)}</small>
              </span>
              <ConfirmButton question="להסיר את החסימה?" confirmLabel="הסרה">הסרה</ConfirmButton>
            </form>
          ))}
          {schoolWide.map((o) => (
            <div key={o.id} className="li">
              <span className="col grow">
                <b>{o.reason || "בית הספר סגור"}</b>
                <small>כל בית הספר · {fmtDate(o.starts_at)} – {fmtDate(o.ends_at)}</small>
              </span>
              <Pill kind="done">נקבע על ידי המנהל</Pill>
            </div>
          ))}
        </div>
        <form action={addMyTimeOff} className="surf pad stack-s" aria-labelledby="off-h">
          <b id="off-h">חסימה חדשה</b>
          <div className="cols2">
            <div className="field"><label htmlFor="from_day">מתאריך</label><input className="inp" id="from_day" name="from_day" type="date" min={today} max={addDays(today, 366)} required defaultValue={today} /></div>
            <div className="field"><label htmlFor="to_day">עד תאריך</label><input className="inp" id="to_day" name="to_day" type="date" min={today} max={addDays(today, 366)} defaultValue={today} /></div>
          </div>
          <label className="ck"><input type="checkbox" name="all_day" defaultChecked />ימים שלמים</label>
          <div className="cols2">
            <div className="field"><label htmlFor="from_time">משעה (אם לא יום שלם)</label><input className="inp num" id="from_time" name="from_time" type="time" /></div>
            <div className="field"><label htmlFor="to_time">עד שעה</label><input className="inp num" id="to_time" name="to_time" type="time" /></div>
          </div>
          <div className="field"><label htmlFor="reason">סיבה</label><input className="inp" id="reason" name="reason" maxLength={120} placeholder="למשל: חופשה, השתלמות" /></div>
          <SubmitButton variant="solid" sm>{needsApproval ? "שליחה לאישור" : "הוספת חסימה"}</SubmitButton>
        </form>
      </div>

      {recent.length ? (
        <>
          <div className="sec-h"><h2>בקשות אחרונות</h2></div>
          <div className="surf list">
            {recent.map((r) => (
              <div key={r.id} className="li">
                <span className="col grow">
                  <b>{describeRequest(r.kind, r.payload, lookup)}</b>
                  <small>{r.note || fmtDate(r.created_at)}</small>
                </span>
                {r.status === "approved" ? <Pill kind="ok">אושר</Pill> : <Pill kind="bad">נדחה</Pill>}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </Shell>
  );
}
