"use client";
import { useActionState } from "react";
import { saveKid, type FormState } from "@/app/(parent)/actions";
import { SubmitButton } from "@/ui/SubmitButton";
import { Alert } from "@/ui/primitives";
import { KID_COLORS, LEVEL_LABEL } from "@/domain/labels";

export type KidFormValues = {
  id?: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  gender: string | null;
  swim_level: string;
  allergies: string;
  medical_notes: string;
  emergency_name: string;
  emergency_phone: string;
  notes: string;
  color: string;
};

export function KidForm({ initial, defaultLastName }: { initial?: KidFormValues; defaultLastName?: string }) {
  const [state, action] = useActionState<FormState, FormData>(saveKid, null);
  const v = initial;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="stack" noValidate>
      {v?.id ? <input type="hidden" name="id" value={v.id} /> : null}
      <div className="surf pad stack">
        <h2 style={{ margin: 0, font: "800 16px var(--f-ui)" }}>פרטי הילד</h2>
        <div className="cols2">
          <div className="field">
            <label htmlFor="first_name">שם פרטי <span className="req">*</span></label>
            <input className="inp" id="first_name" name="first_name" required maxLength={60} defaultValue={v?.first_name} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="last_name">שם משפחה</label>
            <input className="inp" id="last_name" name="last_name" maxLength={60} defaultValue={v?.last_name ?? defaultLastName} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="birth_date">תאריך לידה</label>
            <input className="inp" id="birth_date" name="birth_date" type="date" max={today} defaultValue={v?.birth_date ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="gender">מגדר</label>
            <select className="inp" id="gender" name="gender" defaultValue={v?.gender ?? ""}>
              <option value="">לא צוין</option>
              <option value="m">בן</option>
              <option value="f">בת</option>
              <option value="other">אחר</option>
            </select>
          </div>
        </div>
        <div className="field">
          <span className="lab" id="lvl-lab">רמת שחייה</span>
          <div className="radio-chips" role="radiogroup" aria-labelledby="lvl-lab">
            {Object.entries(LEVEL_LABEL).map(([k, label]) => (
              <label key={k}>
                <input type="radio" name="swim_level" value={k} defaultChecked={(v?.swim_level ?? "beginner") === k} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="lab" id="color-lab">צבע מזהה</span>
          <div className="color-pick" role="radiogroup" aria-labelledby="color-lab">
            {KID_COLORS.map((c, i) => (
              <label key={c} aria-label={`צבע ${i + 1}`}>
                <input type="radio" name="color" value={c} defaultChecked={(v?.color ?? KID_COLORS[0]) === c} />
                <span style={{ background: c }} />
              </label>
            ))}
          </div>
          <span className="hint">כך נזהה את הילד ביומן ובכרטיסים.</span>
        </div>
      </div>

      <div className="surf pad stack">
        <h2 style={{ margin: 0, font: "800 16px var(--f-ui)" }}>בריאות ובטיחות</h2>
        <div className="field">
          <label htmlFor="allergies">אלרגיות</label>
          <input className="inp" id="allergies" name="allergies" maxLength={500} defaultValue={v?.allergies} placeholder="לא חובה" />
          <span className="hint">יוצג למדריך בבריכה מטעמי בטיחות.</span>
        </div>
        <div className="field">
          <label htmlFor="medical_notes">מידע רפואי נוסף</label>
          <textarea className="inp" id="medical_notes" name="medical_notes" maxLength={1000} defaultValue={v?.medical_notes} placeholder="לא חובה" />
          <span className="private">רואים רק אתם והנהלת בית הספר</span>
        </div>
        <div className="cols2">
          <div className="field">
            <label htmlFor="emergency_name">איש קשר לחירום</label>
            <input className="inp" id="emergency_name" name="emergency_name" maxLength={120} defaultValue={v?.emergency_name} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="emergency_phone">טלפון חירום</label>
            <input className="inp ltr" id="emergency_phone" name="emergency_phone" type="tel" inputMode="tel" dir="ltr" defaultValue={v?.emergency_phone} autoComplete="off" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="notes">משהו שחשוב שנדע</label>
          <textarea className="inp" id="notes" name="notes" maxLength={1000} defaultValue={v?.notes} placeholder="פחדים, העדפות, ניסיון קודם…" />
        </div>
      </div>

      {state?.error ? <Alert kind="bad">{state.error}</Alert> : null}
      {state?.ok ? <Alert kind="ok">{state.ok}</Alert> : null}
      <SubmitButton full>{v?.id ? "שמירת שינויים" : "הוספת הילד"}</SubmitButton>
    </form>
  );
}
