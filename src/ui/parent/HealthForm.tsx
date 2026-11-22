"use client";
import { useActionState, useState } from "react";
import { signHealth, type FormState } from "@/app/(parent)/actions";
import { SubmitButton } from "@/ui/SubmitButton";
import { Alert } from "@/ui/primitives";
import { SignaturePad } from "./SignaturePad";

const QUESTIONS: { key: string; text: string; hint: string }[] = [
  { key: "heart", text: "האם ידוע על בעיית לב, לחץ דם או התעלפויות?", hint: "כולל אבחנה בעבר" },
  { key: "asthma", text: "האם יש אסתמה או קושי נשימתי במאמץ?", hint: "ציינו משאף וטיפול אם יש" },
  { key: "epilepsy", text: "האם יש אפילפסיה או היסטוריה של פרכוסים?", hint: "" },
  { key: "surgery", text: "האם עבר/ה ניתוח, פציעה או אשפוז בשנה האחרונה?", hint: "" },
  { key: "meds", text: "האם נוטל/ת תרופות באופן קבוע?", hint: "" },
  { key: "other", text: "האם יש מגבלה רפואית, התנהגותית או רגשית נוספת שחשוב שנדע?", hint: "למשל פחד ממים, קשב, רגישות חושית" },
];

export function HealthForm({ studentId, kidName, signerDefault, cancellationHours }: { studentId: string; kidName: string; signerDefault: string; cancellationHours: number }) {
  const [state, action] = useActionState<FormState, FormData>(signHealth, null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [fit, setFit] = useState<string>("");
  const [signer, setSigner] = useState(signerDefault);

  return (
    <form action={action} className="stack" noValidate>
      <input type="hidden" name="student_id" value={studentId} />
      <div className="surf list">
        {QUESTIONS.map((q, i) => (
          <fieldset key={q.key} className="hq">
            <legend><span className="num">{i + 1}</span>{q.text} <i className="req">*</i></legend>
            {q.hint ? <span className="hint" style={{ marginTop: -6 }}>{q.hint}</span> : null}
            <div className="radio-chips">
              {[["no", "לא"], ["yes", "כן"]].map(([v, l]) => (
                <label key={v}>
                  <input type="radio" name={`q_${q.key}`} value={v} required onChange={() => setAnswers((a) => ({ ...a, [q.key]: v! }))} />
                  <span>{l}</span>
                </label>
              ))}
            </div>
            {answers[q.key] === "yes" ? (
              <div className="field">
                <label htmlFor={`d_${q.key}`}>פרטו בבקשה <i className="req">*</i></label>
                <textarea className="inp" id={`d_${q.key}`} name={`d_${q.key}`} maxLength={500} required />
              </div>
            ) : null}
          </fieldset>
        ))}

        <fieldset className="hq">
          <legend><span className="num">7</span>פרסום תמונות ברשתות החברתיות</legend>
          <span className="hint" style={{ marginTop: -6 }}>תיעוד פנימי ללמידה ופרסום ברשתות הם דברים נפרדים. סירוב לא משפיע על הרישום.</span>
          <div className="radio-chips">
            <label><input type="radio" name="photos" value="yes" /><span>מסכימים</span></label>
            <label><input type="radio" name="photos" value="no" defaultChecked /><span>לא מסכימים</span></label>
          </div>
        </fieldset>

        <fieldset className="hq">
          <legend><span className="num">8</span>מדיניות ביטול <i className="req">*</i></legend>
          <span className="hint" style={{ marginTop: -6 }}>
            ביטול או שינוי עד {cancellationHours} שעות לפני השיעור. בפחות מזה אין ביטול עצמי והשיעור מחויב.
          </span>
          <label className="ck"><input type="checkbox" name="policy" required />הובא לידיעתי</label>
        </fieldset>

        <fieldset className="hq">
          <legend><span className="num">9</span>הצהרת כשירות <i className="req">*</i></legend>
          <span className="hint" style={{ marginTop: -6 }}>
            הנני מצהיר/ה שמצבו הבריאותי של {kidName} כשיר ולא ידוע לי על מגבלה רפואית שמונעת השתתפות בשיעורי שחייה.
          </span>
          <div className="radio-chips">
            <label><input type="radio" name="fit" value="fit" required onChange={() => setFit("fit")} /><span>כשיר/ה</span></label>
            <label><input type="radio" name="fit" value="unfit" onChange={() => setFit("unfit")} /><span>לא כשיר/ה</span></label>
          </div>
          {fit === "unfit" ? (
            <span className="block">בית הספר ייצור איתכם קשר לבירור לפני תחילת שיעורים.</span>
          ) : null}
          <div className="field">
            <label htmlFor="extra">מידע נוסף שחשוב שנדע</label>
            <textarea className="inp" id="extra" name="extra" maxLength={1000} placeholder="לא חובה" />
          </div>
        </fieldset>

        <fieldset className="hq">
          <legend><span className="num">10</span>חתימה <i className="req">*</i></legend>
          <div className="field">
            <label htmlFor="signer">שם ההורה החותם</label>
            <input className="inp" id="signer" name="signer" autoComplete="name" required value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="שם מלא" />
          </div>
          <SignaturePad name="signature_png" label="חתימה ביד" />
          <label className="ck"><input type="checkbox" name="confirm" required />אני מאשר/ת שהמידע מלא ונכון וזו חתימתי</label>
        </fieldset>
      </div>
      {state?.error ? <Alert kind="bad">{state.error}</Alert> : null}
      <SubmitButton full pendingLabel="שומרים…">שמירת הצהרה</SubmitButton>
    </form>
  );
}
