"use client";
import { useActionState } from "react";
import { recordProgress, type ProgState } from "@/app/workday/progress-actions";
import { SubmitButton } from "./SubmitButton";
import { Alert, Pill } from "./primitives";
import { PROGRESS, type CategorySummary, type ProgressStatus } from "@/domain/progress";
import "./progress.css";

/** Instructor form: pick a skill, set its status, optional note. Shows current status in the list. */
export function ProgressRecorder({ studentId, firstName, summary }: { studentId: string; firstName: string; summary: CategorySummary[] }) {
  const [state, action] = useActionState<ProgState, FormData>(recordProgress, null);
  const achieved = summary.reduce((n, c) => n + c.achieved, 0);
  const total = summary.reduce((n, c) => n + c.total, 0);
  if (total === 0) return null;
  return (
    <details>
      <summary className="link" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>
        התקדמות של {firstName} · {achieved} מתוך {total} הושגו
      </summary>
      <form action={action} className="prog-form" style={{ marginTop: 8 }}>
        <input type="hidden" name="student" value={studentId} />
        <div className="field">
          <label htmlFor={`sk-${studentId}`}>מיומנות</label>
          <select className="inp" id={`sk-${studentId}`} name="skill" required defaultValue="">
            <option value="" disabled>בחרו מיומנות</option>
            {summary.map((c) => (
              <optgroup key={c.category} label={c.category}>
                {c.skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {PROGRESS[s.status].label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ fontWeight: 700, marginBottom: 6 }}>סטטוס</legend>
          <div className="radio-chips">
            {(Object.keys(PROGRESS) as ProgressStatus[]).map((k) => (
              <label key={k}>
                <input type="radio" name="status" value={k} required defaultChecked={k === "practicing"} />
                <span>{PROGRESS[k].label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor={`pn-${studentId}`}>הערה</label>
          <input className="inp" id={`pn-${studentId}`} name="note" maxLength={500} placeholder="לא חובה · גלוי להורים" />
        </div>
        <SubmitButton variant="solid" sm pendingLabel="שומרים…">שמירת התקדמות</SubmitButton>
        {state?.error ? <Alert kind="bad">{state.error}</Alert> : null}
        {state?.ok ? <Alert kind="ok">{state.ok}</Alert> : null}
        <div className="acts-row" aria-label="סיכום לפי קטגוריה">
          {summary.map((c) => (
            <Pill key={c.category} kind={c.achieved === c.total ? "ok" : c.achieved || c.practicing ? "wait" : "done"}>
              {c.category} {c.achieved}/{c.total}
            </Pill>
          ))}
        </div>
      </form>
    </details>
  );
}
