import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Shell, Head } from "@/ui/Shell";
import { getSettings } from "@/lib/auth";
import { SubmitButton } from "@/ui/SubmitButton";
import { Flash } from "../_lib/Flash";
import { saveSettings } from "./actions";

export const metadata: Metadata = { title: "הגדרות" };

function Toggle({ name, label, hint, on }: { name: string; label: string; hint?: string; on: boolean }) {
  return (
    <label className="toggle">
      <span className="col">
        <b>{label}</b>
        {hint ? <small>{hint}</small> : null}
      </span>
      <input type="checkbox" name={name} defaultChecked={on} />
    </label>
  );
}

function Num({ name, label, hint, value, min, max, unit }: { name: string; label: string; hint?: string; value: number; min: number; max: number; unit: string }) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <div className="row" style={{ gap: 8 }}>
        <input className="inp num" id={name} name={name} type="number" inputMode="numeric" min={min} max={max} defaultValue={value} style={{ maxWidth: 120 }} required />
        <span className="muted">{unit}</span>
      </div>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

function Text({ name, label, value, ltr, type = "text", area }: { name: string; label: string; value: string; ltr?: boolean; type?: string; area?: boolean }) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      {area ? (
        <textarea className="inp" id={name} name={name} defaultValue={value} maxLength={2000} />
      ) : (
        <input className={`inp ${ltr ? "ltr" : ""}`} dir={ltr ? "ltr" : undefined} id={name} name={name} type={type} defaultValue={value} />
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="surf pad stack" aria-label={title}>
      <h2 style={{ margin: 0, font: "800 17px var(--f-ui)" }}>{title}</h2>
      {children}
    </section>
  );
}

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const sp = await searchParams;
  const s = await getSettings();
  return (
    <Shell roles={["admin"]} head={<Head kicker="ניהול" title="הגדרות בית הספר" />}>
      <Flash sp={sp} />
      <form action={saveSettings} className="stack">
        <Group title="הזמנות ומדיניות">
          <div>
            <Toggle name="booking_open" label="ההרשמה לשיעורים פתוחה" hint="כשסגור, הורים לא יכולים לבקש שיעורים חדשים" on={s.booking_open} />
            <Toggle name="require_approval" label="כל בקשה דורשת אישור שלי" hint="כשכבוי, בקשה במועד פנוי מאושרת אוטומטית" on={s.require_approval} />
            <Toggle name="instructor_availability_approval" label="שינויי זמינות של מדריכים דורשים אישור שלי" hint="כשכבוי, מדריך משנה שעות וחופשות בעצמו מיד" on={s.instructor_availability_approval ?? true} />
          </div>
          <Text name="closed_message" label="הודעה כשההרשמה סגורה" value={s.closed_message} />
          <div className="cols2">
            <Num name="cancellation_hours" label="ביטול עצמי עד" unit="שעות לפני השיעור" value={s.cancellation_hours} min={0} max={168} hint="אחרי זה ההורה לא יכול לבטל בעצמו" />
            <Num name="min_notice_hours" label="הזמנה לפחות" unit="שעות מראש" value={s.min_notice_hours} min={0} max={168} />
            <Num name="booking_horizon_days" label="אפשר להזמין עד" unit="ימים קדימה" value={s.booking_horizon_days} min={1} max={365} />
            <Num name="max_lessons_per_week_per_student" label="מקסימום שיעורים לילד בשבוע" unit="(0 = ללא הגבלה)" value={s.max_lessons_per_week_per_student} min={0} max={14} />
            <div className="field">
              <label htmlFor="slot_step_min">מרווח בין שעות התחלה</label>
              <select className="inp" id="slot_step_min" name="slot_step_min" defaultValue={String(s.slot_step_min)}>
                {[5, 10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>כל {m} דקות</option>)}
              </select>
            </div>
            <Num name="buffer_min" label="הפסקה בין שיעורים" unit="דקות" value={s.buffer_min} min={0} max={60} />
          </div>
        </Group>

        <Group title="הצהרת בריאות">
          <Toggle name="health_required" label="חובה הצהרת בריאות בתוקף לפני הזמנה" on={s.health_required} />
          <Num name="health_validity_months" label="תוקף ההצהרה" unit="חודשים" value={s.health_validity_months} min={1} max={60} />
        </Group>

        <Group title="התראות במייל">
          <div>
            <Toggle name="email_admin_new_request" label="מייל למנהלים על בקשה חדשה או ביטול של הורה" on={s.email_admin_new_request ?? true} />
            <Toggle name="email_parent_status" label="מייל להורה כשהשיעור אושר, נדחה או בוטל" on={s.email_parent_status ?? true} />
            <Toggle name="email_reminders" label="תזכורת להורה יום לפני השיעור" on={s.email_reminders ?? true} />
            <Toggle name="email_waitlist" label="מייל לרשימת המתנה כשמתפנה מקום" on={s.email_waitlist ?? true} />
          </div>
          <p className="hint" style={{ margin: 0 }}>התראות בתוך האתר (הפעמון) נשלחות תמיד. מיילים יוצאים רק אחרי חיבור שירות דוא״ל.</p>
        </Group>

        <Group title="תשלום">
          <div>
            <Toggle name="payment_cash" label="מזומן" on={s.payment_cash} />
            <Toggle name="payment_bit" label="Bit" on={s.payment_bit} />
            <Toggle name="payment_paybox" label="PayBox" on={s.payment_paybox} />
            <Toggle name="payment_card" label="כרטיסייה" hint="ניקוב מכרטיסייה בעת ההזמנה" on={s.payment_card} />
          </div>
          <div className="cols2">
            <Text name="bit_phone" label="מספר טלפון לתשלום (Bit ו־PayBox)" value={s.bit_phone} ltr type="tel" />
            <Text name="paybox_link" label="קישור PayBox (https)" value={s.paybox_link} ltr type="url" />
            <Text name="bit_link" label="קישור תשלום Bit (לא חובה, https)" value={s.bit_link ?? ""} ltr type="url" />
          </div>
          <p className="hint" style={{ margin: 0 }}>
            אחרי ההזמנה ההורה מקבל כפתור שפותח את האפליקציה. PayBox: קישור לקבוצה או לתשלום מהאפליקציה (שיתוף קישור). Bit: אם יש לכם קישור תשלום של Bit לעסקים — הדביקו כאן; בלי קישור, ההורה יקבל את המספר והסכום מועתקים ואת אפליקציית Bit פתוחה.
          </p>
        </Group>

        <Group title="פרטי בית הספר">
          <div className="cols2">
            <Text name="business_name" label="שם" value={s.business_name} />
            <Text name="contact_phone" label="טלפון" value={s.contact_phone} ltr type="tel" />
            <Text name="contact_email" label="מייל" value={s.contact_email} ltr type="email" />
            <Text name="address" label="כתובת" value={s.address} />
          </div>
          <Text name="tagline" label="משפט פתיחה (דף הבית)" value={s.tagline} />
          <Text name="welcome_text" label="טקסט ״מי אנחנו״" value={s.welcome_text} area />
        </Group>

        <div className="stepper-foot">
          <SubmitButton variant="primary">שמירת כל ההגדרות</SubmitButton>
        </div>
      </form>
    </Shell>
  );
}
