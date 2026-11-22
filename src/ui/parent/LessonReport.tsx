"use client";
import { useActionState } from "react";
import { reportLesson, type WState } from "@/app/workday/actions";
import { SubmitButton } from "@/ui/SubmitButton";
import { Alert } from "@/ui/primitives";

export function LessonReport({ id, report, started, status }: { id: string; report: string; started: boolean; status: string }) {
  const [state, action] = useActionState<WState, FormData>(reportLesson, null);
  if (!started) return <span className="hint">אפשר לסמן נוכחות ולכתוב דוח אחרי תחילת השיעור.</span>;
  return (
    <form action={action} className="stack-s">
      <input type="hidden" name="id" value={id} />
      <div className="field">
        <label htmlFor={`r-${id}`}>מה תרגלנו · מוקד לפעם הבאה</label>
        <textarea className="inp" id={`r-${id}`} name="report" maxLength={2000} defaultValue={report} placeholder="הסיכום גלוי להורים" />
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {/* the clicked button's name/value is sent as the submitter */}
        <SubmitButton variant="solid" sm name="status" value="completed" pendingLabel="שומרים…">
          {status === "completed" ? "עדכון דוח" : "התקיים · שמירה"}
        </SubmitButton>
        <SubmitButton variant="danger" sm name="status" value="no_show" pendingLabel="שומרים…">
          לא הגיע
        </SubmitButton>
      </div>
      {state?.error ? <Alert kind="bad">{state.error}</Alert> : null}
      {state?.ok ? <Alert kind="ok">{state.ok}</Alert> : null}
    </form>
  );
}
