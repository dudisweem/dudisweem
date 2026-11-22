import type { Metadata } from "next";
import { Shell, Head } from "@/ui/Shell";
import { createClient } from "@/lib/supabase/server";
import { addDays, businessDay, fmtDayLabel, fmtMoney, WEEKDAYS } from "@/domain/format";
import { PAYMENT_LABEL, type Payment } from "@/domain/labels";
import { Alert, Empty } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import "./reports.css";

export const metadata: Metadata = { title: "דוחות" };

type Report = {
  error?: string;
  totals: { lessons: number; revenue: number; paid: number; unpaid: number; card_lessons: number; completed: number; no_show: number; cancelled: number; declined: number; pending: number };
  by_month: { month: string; lessons: number; revenue: number }[];
  by_service: { name: string; lessons: number; revenue: number }[];
  by_payment: { method: Payment; lessons: number; revenue: number; paid: number }[];
  by_weekday: { weekday: number; lessons: number }[];
  by_hour: { hour: number; lessons: number }[];
  by_instructor: { name: string; color: string; lessons: number; completed: number; no_show: number }[];
  new_families: number;
  new_students: number;
};

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** Horizontal bar: label, bar proportional to max, value text. Bars are decoration; the value is text. */
function Bars({ rows, max, color }: { rows: { label: string; value: number; text: string }[]; max: number; color?: string }) {
  return (
    <div className="bars">
      {rows.map((r) => (
        <div key={r.label} className="bar-row">
          <span className="bar-label">{r.label}</span>
          <span className="bar-track" aria-hidden="true">
            <i style={{ width: `${max ? Math.max(2, (r.value / max) * 100) : 0}%`, background: color }} />
          </span>
          <b className="bar-val num">{r.text}</b>
        </div>
      ))}
    </div>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const sp = await searchParams;
  const today = businessDay();
  const monthStart = `${today.slice(0, 8)}01`;
  const monthEnd = addDays(addDays(monthStart, 32).slice(0, 8) + "01", -1);
  let from = isDay(sp.from) ? sp.from : monthStart;
  let to = isDay(sp.to) ? sp.to : monthEnd;
  if (to < from) [from, to] = [to, from];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_report", { p_from: from, p_to: to });
  const r = data as Report | null;
  const bad = error || !r || r.error;

  const presets = [
    { label: "החודש", from: monthStart, to: monthEnd },
    { label: "30 יום אחרונים", from: addDays(today, -29), to: today },
    { label: "השנה", from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` },
  ];

  return (
    <Shell
      roles={["admin"]}
      head={
        <Head kicker="ניהול" title="דוחות">
          <div className="facts">
            <span><Icon name="cal" small />{fmtDayLabel(from)} – {fmtDayLabel(to)}</span>
          </div>
        </Head>
      }
    >
      <form className="surf pad inline-form" action="/admin/reports" aria-label="טווח תאריכים">
        <div className="field"><label htmlFor="from">מתאריך</label><input className="inp" id="from" name="from" type="date" defaultValue={from} required /></div>
        <div className="field"><label htmlFor="to">עד תאריך</label><input className="inp" id="to" name="to" type="date" defaultValue={to} required /></div>
        <button className="btn solid sm" type="submit">הצגה</button>
      </form>
      <nav className="subnav" aria-label="טווחים מהירים">
        {presets.map((p) => (
          <a key={p.label} href={`/admin/reports?from=${p.from}&to=${p.to}`} aria-current={p.from === from && p.to === to ? "page" : undefined}>{p.label}</a>
        ))}
      </nav>

      {bad ? (
        <Alert kind="bad">לא הצלחנו להפיק את הדוח לטווח הזה (עד שנתיים). נסו טווח אחר.</Alert>
      ) : (
        <>
          <div className="gauges" role="list" aria-label="סיכום">
            <div className="gauge" role="listitem"><span className="g-n num">{fmtMoney(r.totals.revenue)}</span><span className="g-l">הכנסות (מאושר + התקיים)</span></div>
            <div className="gauge" role="listitem"><span className="g-n num">{fmtMoney(r.totals.paid)}</span><span className="g-l">שולם</span></div>
            <div className={`gauge${r.totals.unpaid ? " warn" : ""}`} role="listitem"><span className="g-n num">{fmtMoney(r.totals.unpaid)}</span><span className="g-l">טרם שולם (בלי כרטיסיות)</span></div>
            <div className="gauge" role="listitem"><span className="g-n num">{r.totals.lessons}</span><span className="g-l">שיעורים</span></div>
            <div className="gauge" role="listitem"><span className="g-n num">{r.new_families}</span><span className="g-l">משפחות חדשות · {r.new_students} ילדים</span></div>
          </div>

          {r.totals.lessons === 0 && r.totals.cancelled === 0 && r.totals.declined === 0 ? (
            <div className="surf"><Empty icon="chart">אין שיעורים בטווח הזה.</Empty></div>
          ) : (
            <div className="cols2">
              <section className="surf pad stack-s" aria-labelledby="att-h">
                <b id="att-h">נוכחות וביטולים</b>
                {(() => {
                  const marked = r.totals.completed + r.totals.no_show;
                  const rate = marked ? Math.round((r.totals.completed / marked) * 100) : null;
                  return (
                    <>
                      <p className="small muted" style={{ margin: 0 }}>
                        {rate === null ? "עוד לא סומנה נוכחות בטווח." : `שיעור הגעה ${rate}% (${r.totals.completed} התקיימו, ${r.totals.no_show} לא הגיעו).`}
                      </p>
                      <Bars
                        max={Math.max(r.totals.completed, r.totals.no_show, r.totals.cancelled, r.totals.declined, r.totals.pending, 1)}
                        rows={[
                          { label: "התקיים", value: r.totals.completed, text: String(r.totals.completed) },
                          { label: "לא הגיע", value: r.totals.no_show, text: String(r.totals.no_show) },
                          { label: "בוטל", value: r.totals.cancelled, text: String(r.totals.cancelled) },
                          { label: "נדחה", value: r.totals.declined, text: String(r.totals.declined) },
                          { label: "ממתין", value: r.totals.pending, text: String(r.totals.pending) },
                        ]}
                      />
                    </>
                  );
                })()}
              </section>

              <section className="surf pad stack-s" aria-labelledby="mon-h">
                <b id="mon-h">הכנסות לפי חודש</b>
                <Bars
                  max={Math.max(...r.by_month.map((m) => m.revenue), 1)}
                  rows={r.by_month.map((m) => ({ label: monthLabel(m.month), value: m.revenue, text: `${fmtMoney(m.revenue)} · ${m.lessons}` }))}
                />
              </section>

              <section className="surf pad stack-s" aria-labelledby="svc-h">
                <b id="svc-h">לפי סוג שיעור</b>
                <Bars
                  max={Math.max(...r.by_service.map((s) => s.revenue), 1)}
                  rows={r.by_service.map((s) => ({ label: s.name, value: s.revenue, text: `${fmtMoney(s.revenue)} · ${s.lessons}` }))}
                />
              </section>

              <section className="surf pad stack-s" aria-labelledby="pay-h">
                <b id="pay-h">לפי אמצעי תשלום</b>
                <Bars
                  max={Math.max(...r.by_payment.map((p) => p.lessons), 1)}
                  rows={r.by_payment.map((p) => ({
                    label: PAYMENT_LABEL[p.method] ?? p.method,
                    value: p.lessons,
                    text: p.method === "card" ? `${p.lessons} שיעורים` : `${fmtMoney(p.revenue)} · שולם ${fmtMoney(p.paid)}`,
                  }))}
                />
              </section>

              <section className="surf pad stack-s" aria-labelledby="day-h">
                <b id="day-h">ימים עמוסים</b>
                <Bars
                  max={Math.max(...r.by_weekday.map((d) => d.lessons), 1)}
                  rows={WEEKDAYS.map((name, d) => {
                    const v = r.by_weekday.find((x) => x.weekday === d)?.lessons ?? 0;
                    return { label: name, value: v, text: String(v) };
                  })}
                />
              </section>

              <section className="surf pad stack-s" aria-labelledby="hr-h">
                <b id="hr-h">שעות עמוסות</b>
                {r.by_hour.length ? (
                  <Bars
                    max={Math.max(...r.by_hour.map((h) => h.lessons), 1)}
                    rows={r.by_hour.map((h) => ({ label: `${String(h.hour).padStart(2, "0")}:00`, value: h.lessons, text: String(h.lessons) }))}
                  />
                ) : (
                  <span className="small muted">אין נתונים.</span>
                )}
              </section>

              <section className="surf pad stack-s" aria-labelledby="ins-h">
                <b id="ins-h">לפי מדריך</b>
                <Bars
                  max={Math.max(...r.by_instructor.map((i) => i.lessons), 1)}
                  rows={r.by_instructor.map((i) => ({
                    label: i.name,
                    value: i.lessons,
                    text: `${i.lessons} שיעורים${i.no_show ? ` · ${i.no_show} לא הגיעו` : ""}`,
                  }))}
                />
              </section>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
