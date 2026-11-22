import type { Metadata } from "next";
import { Shell, Head } from "@/ui/Shell";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney } from "@/domain/format";
import { Empty, Pill } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import { SubmitButton } from "@/ui/SubmitButton";
import { ConfirmButton } from "@/ui/admin/ConfirmButton";
import { Flash } from "../_lib/Flash";
import { createService, deleteService, updateService } from "./actions";

export const metadata: Metadata = { title: "סוגי שיעורים" };

type Service = {
  id: string; name: string; description: string; duration_min: number; price_agorot: number; capacity: number;
  min_age: number | null; max_age: number | null; active: boolean; bookable_by_parents: boolean; sort: number;
};

function Fields({ s }: { s?: Service }) {
  const k = s?.id ?? "new";
  return (
    <>
      <div className="form-grid">
        <div className="field wide"><label htmlFor={`n-${k}`}>שם</label><input className="inp" id={`n-${k}`} name="name" required minLength={2} maxLength={80} defaultValue={s?.name} placeholder="למשל: שיעור פרטני" /></div>
        <div className="field wide"><label htmlFor={`d-${k}`}>תיאור להורים</label><input className="inp" id={`d-${k}`} name="description" maxLength={500} defaultValue={s?.description} /></div>
        <div className="field"><label htmlFor={`p-${k}`}>מחיר לשיעור (₪)</label><input className="inp num" id={`p-${k}`} name="price" inputMode="decimal" required pattern="\d+(\.\d{1,2})?" defaultValue={s ? String(s.price_agorot / 100) : ""} /></div>
        <div className="field"><label htmlFor={`m-${k}`}>משך (דקות)</label><input className="inp num" id={`m-${k}`} name="duration_min" type="number" min={10} max={240} step={5} required defaultValue={s?.duration_min ?? 45} /></div>
        <div className="field"><label htmlFor={`c-${k}`}>משתתפים מקסימום</label><input className="inp num" id={`c-${k}`} name="capacity" type="number" min={1} max={30} required defaultValue={s?.capacity ?? 1} /></div>
        <div className="field"><label htmlFor={`a1-${k}`}>מגיל</label><input className="inp num" id={`a1-${k}`} name="min_age" type="number" min={0} max={99} defaultValue={s?.min_age ?? ""} /></div>
        <div className="field"><label htmlFor={`a2-${k}`}>עד גיל</label><input className="inp num" id={`a2-${k}`} name="max_age" type="number" min={0} max={99} defaultValue={s?.max_age ?? ""} /></div>
        <div className="field"><label htmlFor={`o-${k}`}>סדר תצוגה</label><input className="inp num" id={`o-${k}`} name="sort" type="number" min={0} max={999} defaultValue={s?.sort ?? 0} /></div>
      </div>
      <div>
        <label className="toggle"><span className="col"><b>פעיל</b><small>שיעור לא פעיל לא מוצג בשום מקום</small></span><input type="checkbox" name="active" defaultChecked={s ? s.active : true} /></label>
        <label className="toggle"><span className="col"><b>הורים יכולים להזמין</b><small>כבוי = רק את/ה קובע/ת את השיעור הזה</small></span><input type="checkbox" name="bookable_by_parents" defaultChecked={s ? s.bookable_by_parents : true} /></label>
      </div>
    </>
  );
}

export default async function ServicesPage({ searchParams }: PageProps<"/admin/services">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("services").select("*").order("sort").order("name");
  const services = (data ?? []) as Service[];

  return (
    <Shell roles={["admin"]} head={<Head kicker="ניהול" title="סוגי שיעורים ומחירים" />}>
      <Flash sp={sp} />
      <p className="muted" style={{ margin: 0 }}>שינוי מחיר או משך חל על הזמנות חדשות. שיעורים שכבר הוזמנו שומרים את המחיר שנקבע בזמן ההזמנה.</p>
      {services.length === 0 ? <div className="surf"><Empty icon="waves">אין עדיין סוגי שיעורים.</Empty></div> : null}
      {services.map((s) => (
        <details key={s.id} className="surf">
          <summary>
            <span className="col">
              <b>{s.name}</b>
              <small className="muted">{s.duration_min} דקות · {s.capacity === 1 ? "אישי" : `עד ${s.capacity}`} · {fmtMoney(s.price_agorot)}</small>
            </span>
            <span className="acts-row">
              {s.active ? <Pill kind="ok">פעיל</Pill> : <Pill kind="done">לא פעיל</Pill>}
              {!s.bookable_by_parents ? <Pill kind="free">מנהל בלבד</Pill> : null}
              <Icon name="pen" small />
            </span>
          </summary>
          <form action={updateService} className="pad stack">
            <input type="hidden" name="id" value={s.id} />
            <Fields s={s} />
            <SubmitButton variant="solid" sm>שמירה</SubmitButton>
          </form>
          <form action={deleteService} className="acts-row" style={{ padding: "0 16px 16px" }}>
            <input type="hidden" name="id" value={s.id} />
            <ConfirmButton question={`למחוק את "${s.name}"?`} confirmLabel="מחיקה">מחיקה</ConfirmButton>
          </form>
        </details>
      ))}
      <details className="surf" open={services.length === 0}>
        <summary><span className="row"><Icon name="plus" />סוג שיעור חדש</span></summary>
        <form action={createService} className="pad stack">
          <Fields />
          <SubmitButton variant="primary">הוספה</SubmitButton>
        </form>
      </details>
    </Shell>
  );
}
