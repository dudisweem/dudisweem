import type { Metadata } from "next";
import Link from "next/link";
import { Shell, Head } from "@/ui/Shell";
import { createClient } from "@/lib/supabase/server";
import { businessDay, fmtDate, fmtTime, WEEKDAYS } from "@/domain/format";
import { Avatar, Empty, Pill } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import { SubmitButton } from "@/ui/SubmitButton";
import { ConfirmButton } from "@/ui/admin/ConfirmButton";
import { Flash } from "../_lib/Flash";
import { addHours, addTimeOff, decideAvailability, removeHours, removeTimeOff } from "./actions";
import { describeRequest, type AvailabilityKind } from "@/domain/availability";

export const metadata: Metadata = { title: "שעות עבודה" };

const short = (t: string) => t.slice(0, 5);

export default async function SchedulePage({ searchParams }: PageProps<"/admin/schedule">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [staffRes, whRes, offRes, reqRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, color, role").in("role", ["admin", "instructor"]).eq("active", true).order("full_name"),
    supabase.from("working_hours").select("id, instructor_id, weekday, start_time, end_time").order("weekday").order("start_time"),
    supabase.from("time_off").select("id, instructor_id, starts_at, ends_at, reason").gte("ends_at", new Date().toISOString()).order("starts_at"),
    supabase.from("availability_requests").select("id, instructor_id, kind, payload, created_at").eq("status", "pending").order("created_at"),
  ]);
  const pendingReqs = (reqRes.data ?? []) as { id: string; instructor_id: string; kind: AvailabilityKind; payload: Record<string, unknown>; created_at: string }[];
  const hoursLookup = new Map((whRes.data ?? []).map((w) => [w.id, `יום ${WEEKDAYS[w.weekday]} ${short(w.start_time)}–${short(w.end_time)}`]));
  const offLookup = new Map((offRes.data ?? []).map((o) => [o.id, `${fmtDate(o.starts_at)}${o.reason ? " · " + o.reason : ""}`]));
  const staff = staffRes.data ?? [];
  const selected = typeof sp.i === "string" && staff.some((s) => s.id === sp.i) ? sp.i : staff[0]?.id;
  const me = staff.find((s) => s.id === selected);
  const wh = (whRes.data ?? []).filter((w) => w.instructor_id === selected);
  const off = offRes.data ?? [];
  const back = selected ? `/admin/schedule?i=${selected}` : "/admin/schedule";
  const today = businessDay();
  const weeklyHours = wh.reduce((n, w) => {
    const [a, b] = [w.start_time, w.end_time].map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)));
    return n + (b! - a!) / 60;
  }, 0);

  return (
    <Shell roles={["admin"]} head={<Head kicker="ניהול" title="שעות עבודה וחסימות" />}>
      <Flash sp={sp} />
      {pendingReqs.length ? (
        <section className="surf list" aria-labelledby="avreq-h">
          <div className="pad row">
            <Icon name="inbox" />
            <b id="avreq-h" className="grow">בקשות זמינות ממדריכים</b>
            <Pill kind="wait">{pendingReqs.length} ממתינות</Pill>
          </div>
          {pendingReqs.map((r) => {
            const who = staff.find((s) => s.id === r.instructor_id);
            return (
              <form key={r.id} action={decideAvailability} className="pad stack-s">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="back" value={back} />
                <div className="row">
                  {who ? <Avatar name={who.full_name} color={who.color} /> : null}
                  <span className="col grow">
                    <b>{who?.full_name || "מדריך"}</b>
                    <small>{describeRequest(r.kind, r.payload, { hours: hoursLookup, off: offLookup })}</small>
                  </span>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label htmlFor={`n-${r.id}`}>הערה למדריך (לא חובה)</label>
                    <input className="inp" id={`n-${r.id}`} name="note" maxLength={300} />
                  </div>
                  <SubmitButton variant="solid" sm name="decision" value="approve"><Icon name="check" small />אישור</SubmitButton>
                  <SubmitButton variant="danger" sm name="decision" value="reject"><Icon name="x" small />דחייה</SubmitButton>
                </div>
              </form>
            );
          })}
        </section>
      ) : null}
      {staff.length === 0 ? (
        <div className="surf"><Empty icon="user">אין מדריכים. הפכו משתמש למדריך ב<Link className="link" href="/admin/users">משתמשים</Link>.</Empty></div>
      ) : (
        <>
          <nav className="subnav" aria-label="בחירת מדריך">
            {staff.map((s) => (
              <Link key={s.id} href={`/admin/schedule?i=${s.id}`} aria-current={s.id === selected ? "page" : undefined}>
                <span className="dot-c" style={{ background: s.color }} />
                {s.full_name || "ללא שם"}
              </Link>
            ))}
          </nav>

          <div className="two">
            <section className="surf" aria-labelledby="wh-h">
              <div className="pad row" style={{ paddingBottom: 4 }}>
                {me ? <Avatar name={me.full_name} color={me.color} /> : null}
                <div className="col grow">
                  <b id="wh-h">שעות קבועות של {me?.full_name || "המדריך"}</b>
                  <small className="muted">{weeklyHours ? `${weeklyHours} שעות בשבוע` : "עוד לא הוגדרו שעות — הורים לא יראו מועדים"}</small>
                </div>
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
                          <form key={w.id} action={removeHours} className="wh-chip">
                            <input type="hidden" name="id" value={w.id} />
                            <input type="hidden" name="back" value={back} />
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

            <form action={addHours} className="surf pad stack-s" aria-labelledby="add-h">
              <b id="add-h">הוספת שעות</b>
              <input type="hidden" name="instructor" value={selected} />
              <input type="hidden" name="back" value={back} />
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="small" style={{ fontWeight: 700, marginBottom: 6 }}>בימים</legend>
                <div className="chips">
                  {WEEKDAYS.map((name, d) => (
                    <label key={d} className="chip" style={{ cursor: "pointer" }}>
                      <input type="checkbox" name="weekday" value={d} defaultChecked={d >= 0 && d <= 4 && wh.length === 0} />
                      {name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="cols2">
                <div className="field"><label htmlFor="start">משעה</label><input className="inp num" id="start" name="start" type="time" step={300} required defaultValue="08:00" /></div>
                <div className="field"><label htmlFor="end">עד שעה</label><input className="inp num" id="end" name="end" type="time" step={300} required defaultValue="13:00" /></div>
              </div>
              <span className="hint">אפשר כמה טווחים ביום, למשל 08:00–12:00 ו־16:00–20:00.</span>
              <SubmitButton variant="primary" sm><Icon name="plus" />הוספה</SubmitButton>
            </form>
          </div>
        </>
      )}

      <div className="sec-h"><h2>חופשות, חגים וחסימות</h2></div>
      <div className="two">
        <div className="surf list">
          {off.length === 0 ? <Empty icon="cal">אין חסימות קרובות.</Empty> : null}
          {off.map((o) => {
            const who = o.instructor_id ? staff.find((s) => s.id === o.instructor_id)?.full_name ?? "מדריך" : "כל בית הספר";
            return (
              <form key={o.id} action={removeTimeOff} className="li">
                <input type="hidden" name="id" value={o.id} />
                <input type="hidden" name="back" value={back} />
                <span className="col grow">
                  <b>{o.reason || "חסום"}</b>
                  <small>
                    {who} · {fmtDate(o.starts_at)} {fmtTime(o.starts_at)} – {fmtDate(o.ends_at)} {fmtTime(o.ends_at)}
                  </small>
                </span>
                <ConfirmButton question="להסיר?" confirmLabel="הסרה">הסרה</ConfirmButton>
              </form>
            );
          })}
        </div>
        <form action={addTimeOff} className="surf pad stack-s" aria-labelledby="off-h">
          <b id="off-h">חסימה חדשה</b>
          <input type="hidden" name="back" value={back} />
          <div className="field">
            <label htmlFor="who">למי</label>
            <select className="inp" id="who" name="who" defaultValue="all">
              <option value="all">כל בית הספר (בריכה סגורה / חג)</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || "ללא שם"}</option>)}
            </select>
          </div>
          <div className="cols2">
            <div className="field"><label htmlFor="from_day">מתאריך</label><input className="inp" id="from_day" name="from_day" type="date" min={today} required defaultValue={today} /></div>
            <div className="field"><label htmlFor="to_day">עד תאריך</label><input className="inp" id="to_day" name="to_day" type="date" min={today} defaultValue={today} /></div>
          </div>
          <label className="ck"><input type="checkbox" name="all_day" defaultChecked />ימים שלמים</label>
          <div className="cols2">
            <div className="field"><label htmlFor="from_time">משעה (אם לא יום שלם)</label><input className="inp num" id="from_time" name="from_time" type="time" /></div>
            <div className="field"><label htmlFor="to_time">עד שעה</label><input className="inp num" id="to_time" name="to_time" type="time" /></div>
          </div>
          <div className="field"><label htmlFor="reason">סיבה</label><input className="inp" id="reason" name="reason" maxLength={120} placeholder="למשל: ראש השנה" /></div>
          <span className="hint">חסימה לא מבטלת שיעורים קיימים — רק מונעת הזמנות חדשות. בדקו את היומן.</span>
          <SubmitButton variant="solid" sm>הוספת חסימה</SubmitButton>
        </form>
      </div>
    </Shell>
  );
}
