import type { Metadata } from "next";
import { Shell, Head } from "@/ui/Shell";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney } from "@/domain/format";
import { Empty, Pill } from "@/ui/primitives";
import { Icon } from "@/ui/Icon";
import { SubmitButton } from "@/ui/SubmitButton";
import { ConfirmButton } from "@/ui/admin/ConfirmButton";
import { Flash } from "../_lib/Flash";
import { createPackage, deletePackage, updatePackage } from "./actions";

export const metadata: Metadata = { title: "כרטיסיות" };

type Pkg = { id: string; name: string; service_id: string | null; lessons: number; price_agorot: number; validity_days: number; active: boolean };

function Fields({ p, services }: { p?: Pkg; services: { id: string; name: string; price_agorot: number }[] }) {
  const k = p?.id ?? "new";
  return (
    <>
      <div className="form-grid">
        <div className="field wide"><label htmlFor={`n-${k}`}>שם</label><input className="inp" id={`n-${k}`} name="name" required minLength={2} maxLength={80} defaultValue={p?.name} placeholder="כרטיסייה 10 שיעורים" /></div>
        <div className="field wide">
          <label htmlFor={`s-${k}`}>תקפה לשיעור</label>
          <select className="inp" id={`s-${k}`} name="service_id" defaultValue={p?.service_id ?? ""}>
            <option value="">כל סוגי השיעורים</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor={`l-${k}`}>מספר שיעורים</label><input className="inp num" id={`l-${k}`} name="lessons" type="number" min={1} max={100} required defaultValue={p?.lessons ?? 10} /></div>
        <div className="field"><label htmlFor={`p-${k}`}>מחיר (₪)</label><input className="inp num" id={`p-${k}`} name="price" inputMode="decimal" pattern="\d+(\.\d{1,2})?" required defaultValue={p ? String(p.price_agorot / 100) : ""} /></div>
        <div className="field"><label htmlFor={`v-${k}`}>תוקף (ימים)</label><input className="inp num" id={`v-${k}`} name="validity_days" type="number" min={1} max={1095} required defaultValue={p?.validity_days ?? 180} /></div>
      </div>
      <label className="toggle"><span className="col"><b>פעיל</b><small>חבילה לא פעילה לא תוצע לרכישה</small></span><input type="checkbox" name="active" defaultChecked={p ? p.active : true} /></label>
    </>
  );
}

export default async function PackagesPage({ searchParams }: PageProps<"/admin/packages">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data }, { data: services }] = await Promise.all([
    supabase.from("packages").select("*").order("created_at"),
    supabase.from("services").select("id, name, price_agorot").order("sort"),
  ]);
  const pkgs = (data ?? []) as Pkg[];
  const svc = services ?? [];

  return (
    <Shell roles={["admin"]} head={<Head kicker="ניהול" title="כרטיסיות" />}>
      <Flash sp={sp} />
      <p className="muted" style={{ margin: 0 }}>מוסיפים כרטיסייה לילד מכרטיס התלמיד. כל שיעור שהורה מזמין עם ״כרטיסייה״ מנקב שיעור אחד, וביטול מחזיר אותו.</p>
      {pkgs.length === 0 ? <div className="surf"><Empty icon="card">אין חבילות עדיין.</Empty></div> : null}
      {pkgs.map((p) => {
        const s = svc.find((x) => x.id === p.service_id);
        const per = Math.round(p.price_agorot / p.lessons);
        const save = s ? s.price_agorot * p.lessons - p.price_agorot : 0;
        return (
          <details key={p.id} className="surf">
            <summary>
              <span className="col">
                <b>{p.name}</b>
                <small className="muted">
                  {p.lessons} שיעורים · {fmtMoney(p.price_agorot)} ({fmtMoney(per)} לשיעור{save > 0 ? `, חיסכון ${fmtMoney(save)}` : ""}) · {p.validity_days} ימים · {s?.name ?? "כל השיעורים"}
                </small>
              </span>
              <span className="acts-row">{p.active ? <Pill kind="ok">פעיל</Pill> : <Pill kind="done">לא פעיל</Pill>}<Icon name="pen" small /></span>
            </summary>
            <form action={updatePackage} className="pad stack">
              <input type="hidden" name="id" value={p.id} />
              <Fields p={p} services={svc} />
              <SubmitButton variant="solid" sm>שמירה</SubmitButton>
            </form>
            <form action={deletePackage} className="acts-row" style={{ padding: "0 16px 16px" }}>
              <input type="hidden" name="id" value={p.id} />
              <ConfirmButton question={`למחוק את "${p.name}"? כרטיסיות שכבר נמכרו ימשיכו לעבוד.`} confirmLabel="מחיקה">מחיקה</ConfirmButton>
            </form>
          </details>
        );
      })}
      <details className="surf" open={pkgs.length === 0}>
        <summary><span className="row"><Icon name="plus" />חבילה חדשה</span></summary>
        <form action={createPackage} className="pad stack">
          <Fields services={svc} />
          <SubmitButton variant="primary">הוספה</SubmitButton>
        </form>
      </details>
    </Shell>
  );
}
