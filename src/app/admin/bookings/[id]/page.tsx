import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell, Head } from "@/ui/Shell";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/auth";
import { fmtDate, fmtMoney, fmtTime, fmtWeekday, healthValid } from "@/domain/format";
import { PAYMENT_LABEL } from "@/domain/labels";
import { Pill, StatusPill } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import { SubmitButton } from "@/ui/SubmitButton";
import { ConfirmButton } from "@/ui/admin/ConfirmButton";
import { BOOKING_SELECT, kidName, type AdminBooking } from "../../_lib/queries";
import { Flash } from "../../_lib/Flash";
import { nowMs } from "../../_lib/util";
import { cancelBooking, saveNotes, setPaid, setStatus } from "../../actions";

export const metadata: Metadata = { title: "שיעור" };

export default async function BookingDetail({ params, searchParams }: PageProps<"/admin/bookings/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const settings = await getSettings();
  const { data } = await supabase.from("bookings").select(BOOKING_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const b = data as unknown as AdminBooking;
  const back = `/admin/bookings/${b.id}`;
  const started = new Date(b.starts_at).getTime() <= nowMs();
  const active = b.status === "pending" || b.status === "approved";
  const health = healthValid(b.student?.health_signed_at ?? null, settings.health_validity_months, settings.health_required);

  return (
    <Shell
      roles={["admin"]}
      head={
        <Head kicker={`שיעור #${b.number} · ${b.service?.name ?? ""}`} title={kidName(b)}>
          <div className="readout num">
            {fmtTime(b.starts_at)}
            <small>
              {fmtWeekday(b.starts_at)} {fmtDate(b.starts_at)}
              <br />
              עד {fmtTime(b.ends_at)}
            </small>
          </div>
        </Head>
      }
    >
      <Flash sp={sp} />
      <div className="two">
        <div className="stack">
          <section className="surf pad stack">
            <div className="axes">
              <div className="axis"><span>סטטוס</span><StatusPill status={b.status} /></div>
              <div className="axis">
                <span>תשלום</span>
                {b.payment_method === "card" ? <Pill kind="free">מכרטיסייה</Pill> : b.paid ? <Pill kind="ok">שולם</Pill> : <Pill kind="wait">לא שולם</Pill>}
              </div>
              <div className="axis"><span>בריאות</span>{health ? <Pill kind="ok">בתוקף</Pill> : <Pill kind="bad">חסרה</Pill>}</div>
              <div className="axis"><span>מחיר</span><b className="num">{fmtMoney(b.price_agorot)} · {PAYMENT_LABEL[b.payment_method]}</b></div>
            </div>
            <dl className="kv-grid">
              <dt>מדריך</dt><dd>{b.instructor?.full_name}</dd>
              <dt>הורה</dt><dd>{b.student?.parent?.full_name || "—"}</dd>
              {b.student?.parent?.phone ? (<><dt>טלפון</dt><dd><a href={`tel:${b.student.parent.phone}`} dir="ltr">{b.student.parent.phone}</a></dd></>) : null}
              {b.student?.parent?.email ? (<><dt>מייל</dt><dd dir="ltr" style={{ textAlign: "right" }}>{b.student.parent.email}</dd></>) : null}
              <dt>נוצר</dt><dd>{fmtDate(b.created_at)} {fmtTime(b.created_at)}</dd>
            </dl>
            {b.parent_note ? <p style={{ margin: 0 }}><b>הערת הורה: </b>{b.parent_note}</p> : null}
            {b.student ? <Link className="link" href={`/admin/students/${b.student.id}`}>לכרטיס התלמיד ←</Link> : null}
          </section>

          <form action={saveNotes} className="surf pad stack">
            <input type="hidden" name="id" value={b.id} />
            <input type="hidden" name="back" value={back} />
            <div className="field">
              <label htmlFor="staff_note">הערת צוות (לא מוצגת להורה)</label>
              <textarea className="inp" id="staff_note" name="staff_note" defaultValue={b.staff_note} maxLength={2000} />
            </div>
            <div className="field">
              <label htmlFor="lesson_report">דוח שיעור</label>
              <textarea className="inp" id="lesson_report" name="lesson_report" defaultValue={b.lesson_report} maxLength={4000} placeholder="מה עבדנו עליו, התקדמות, מטרה לשיעור הבא" />
            </div>
            <SubmitButton variant="solid">שמירת הערות</SubmitButton>
          </form>
        </div>

        <aside className="stack">
          {b.status === "pending" ? (
            <form action={setStatus} className="surf pad stack-s">
              <b>בקשה ממתינה</b>
              <input type="hidden" name="id" value={b.id} />
              <input type="hidden" name="back" value={back} />
              <div className="acts-row">
                <SubmitButton name="status" value="approved" variant="solid" sm><Icon name="check" />אישור</SubmitButton>
                <SubmitButton name="status" value="declined" variant="danger" sm><Icon name="x" />דחייה</SubmitButton>
              </div>
            </form>
          ) : null}

          {started && ["approved", "completed", "no_show"].includes(b.status) ? (
            <form action={setStatus} className="surf pad stack-s">
              <b>נוכחות</b>
              <input type="hidden" name="id" value={b.id} />
              <input type="hidden" name="back" value={back} />
              <div className="segbtns">
                <SubmitButton name="status" value="completed" variant={b.status === "completed" ? "solid" : "ghost"} sm><Icon name="check" />התקיים</SubmitButton>
                <SubmitButton name="status" value="no_show" variant={b.status === "no_show" ? "danger" : "ghost"} sm><Icon name="x" />לא הגיע</SubmitButton>
              </div>
            </form>
          ) : null}

          {b.payment_method !== "card" && ["approved", "completed", "no_show"].includes(b.status) ? (
            <form action={setPaid} className="surf pad stack-s">
              <b>תשלום</b>
              <input type="hidden" name="id" value={b.id} />
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="paid" value={b.paid ? "false" : "true"} />
              <SubmitButton variant={b.paid ? "ghost" : "primary"} sm>
                <Icon name="wallet" />
                {b.paid ? "סימון כלא שולם" : `סימון ששולם (${fmtMoney(b.price_agorot)})`}
              </SubmitButton>
            </form>
          ) : null}

          {active ? (
            <form action={cancelBooking} className="surf pad stack-s">
              <b>ביטול שיעור</b>
              <input type="hidden" name="id" value={b.id} />
              <input type="hidden" name="back" value={back} />
              <input className="inp sm" name="reason" placeholder="סיבה (לא חובה)" maxLength={300} />
              <span className="hint">כמנהל אפשר לבטל בכל זמן. שיעור מכרטיסייה יחזור ליתרה.</span>
              <div><ConfirmButton question="לבטל את השיעור?" confirmLabel="כן, לבטל">ביטול השיעור</ConfirmButton></div>
            </form>
          ) : null}

          <Link href="/admin/calendar" className="btn quiet">חזרה ליומן</Link>
        </aside>
      </div>
    </Shell>
  );
}
